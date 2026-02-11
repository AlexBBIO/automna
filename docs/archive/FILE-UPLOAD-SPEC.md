# Robust File Upload System

**Date:** 2026-02-02  
**Status:** Specification  
**Priority:** P0

---

## Problem

Current approach uses Fly Machines exec API to run shell commands for file uploads. This is:
- Fragile (shell escaping, command length limits)
- Slow (multiple round trips for chunked uploads)
- Not designed for binary data transfer

---

## Solution: Dedicated File Server in Container

Add a lightweight HTTP file server to the Docker image that handles uploads/downloads directly on the volume.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (automna.ai)                          │
│                                                                  │
│  Upload file → POST /api/files/upload                           │
│                       │                                          │
└───────────────────────┼──────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel API Route                              │
│                                                                  │
│  1. Validate auth (Clerk)                                       │
│  2. Get user's Fly app from Turso                               │
│  3. Stream file to: https://automna-u-xxx.fly.dev:8080/upload   │
│                                                                  │
└───────────────────────┼──────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Fly Machine (automna-u-xxx)                         │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │ OpenClaw Gateway│    │     File Server (port 8080)         │ │
│  │   (port 18789)  │    │                                     │ │
│  │                 │    │  POST /upload?path=/workspace/x.png │ │
│  │  Chat, WS, etc  │    │  GET  /download?path=/workspace/x   │ │
│  │                 │    │  GET  /list?path=/workspace         │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
│                                    │                             │
│                                    ▼                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Fly Volume (/home/node/.openclaw)               ││
│  │                                                              ││
│  │  /workspace/uploads/1234_image.png                          ││
│  │  /workspace/SOUL.md                                         ││
│  │  /agents/main/sessions/...                                  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## File Server Specification

### Technology
- **Node.js** (already in container)
- **Fastify** or plain `http` module (minimal dependencies)
- Single file: `file-server.js` (~100 lines)

### Endpoints

#### POST /upload
Upload a file to the workspace.

```
POST /upload?path=/home/node/.openclaw/workspace/uploads/image.png
Authorization: Bearer <gateway_token>
Content-Type: multipart/form-data (or application/octet-stream)

Body: <binary file data>

Response 200:
{
  "success": true,
  "path": "/home/node/.openclaw/workspace/uploads/image.png",
  "size": 102400
}

Response 400:
{ "error": "Invalid path" }

Response 401:
{ "error": "Unauthorized" }
```

#### GET /download
Download a file from the workspace.

```
GET /download?path=/home/node/.openclaw/workspace/uploads/image.png
Authorization: Bearer <gateway_token>

Response 200:
Content-Type: image/png (or appropriate)
Content-Disposition: attachment; filename="image.png"
<binary file data>

Response 404:
{ "error": "File not found" }
```

#### GET /list
List directory contents.

```
GET /list?path=/home/node/.openclaw/workspace
Authorization: Bearer <gateway_token>

Response 200:
{
  "files": [
    { "name": "SOUL.md", "type": "file", "size": 2048, "modified": "2026-02-02T12:00:00Z" },
    { "name": "uploads", "type": "directory", "size": 4096, "modified": "2026-02-02T12:00:00Z" }
  ]
}
```

#### DELETE /delete
Delete a file or directory.

```
DELETE /delete?path=/home/node/.openclaw/workspace/uploads/old.png
Authorization: Bearer <gateway_token>

Response 200:
{ "success": true }
```

### Security

1. **Token Authentication**
   - Same `OPENCLAW_GATEWAY_TOKEN` used for chat
   - Passed in `Authorization: Bearer <token>` header
   - Or query param `?token=<token>` for GET requests

2. **Path Validation**
   - Only allow paths under `/home/node/.openclaw`
   - Block `..` traversal
   - Sanitize filenames

3. **Size Limits**
   - Default max: 50MB per file
   - Configurable via env var: `MAX_UPLOAD_SIZE`

4. **Internal Port**
   - File server on port 8080 (internal only)
   - Fly exposes only port 443 (gateway)
   - Vercel proxies to internal port

---

## Docker Changes

### Updated Dockerfile

```dockerfile
FROM ghcr.io/phioranex/openclaw-docker:latest

# Copy file server
COPY file-server.js /app/file-server.js

# Copy updated entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
```

### Updated entrypoint.sh

```bash
#!/bin/bash

# Start file server in background
node /app/file-server.js &

# Start session key fixer in background (existing)
node -e "..." &

# Start OpenClaw gateway (foreground)
exec node /app/dist/entry.js gateway "$@"
```

### file-server.js

```javascript
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const PORT = 8080;
const ALLOWED_BASE = '/home/node/.openclaw';
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;
const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '52428800'); // 50MB

function validatePath(p) {
  const resolved = path.resolve(p);
  return resolved.startsWith(ALLOWED_BASE) && !p.includes('..');
}

function authenticate(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7) === TOKEN;
  }
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('token') === TOKEN;
}

const server = http.createServer(async (req, res) => {
  if (!authenticate(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const filePath = url.searchParams.get('path');

  if (!filePath || !validatePath(filePath)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid path' }));
  }

  try {
    if (req.method === 'POST' && url.pathname === '/upload') {
      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      
      // Stream to file
      const writeStream = fs.createWriteStream(filePath);
      await pipeline(req, writeStream);
      
      const stats = await fs.promises.stat(filePath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, path: filePath, size: stats.size }));
    }
    else if (req.method === 'GET' && url.pathname === '/download') {
      const stats = await fs.promises.stat(filePath);
      const filename = path.basename(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': stats.size,
      });
      fs.createReadStream(filePath).pipe(res);
    }
    else if (req.method === 'GET' && url.pathname === '/list') {
      const entries = await fs.promises.readdir(filePath, { withFileTypes: true });
      const files = await Promise.all(entries.map(async (e) => {
        const fullPath = path.join(filePath, e.name);
        const stats = await fs.promises.stat(fullPath);
        return {
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files }));
    }
    else if (req.method === 'DELETE' && url.pathname === '/delete') {
      await fs.promises.rm(filePath, { recursive: true });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    }
    else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err) {
    console.error('[file-server]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[file-server] Listening on port ${PORT}`);
});
```

---

## Fly.toml Changes

Expose internal port for file server:

```toml
[services]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 8080
```

Or use Fly's internal networking - Vercel calls `http://<app>.internal:8080/upload` via Fly proxy.

**Better option:** Keep file server internal-only, route through Vercel API which proxies.

---

## Vercel API Changes

### Updated /api/files/upload

```typescript
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return unauthorized();

  const gateway = await getUserGateway(userId);
  if (!gateway) return notFound();

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const filePath = formData.get('path') as string;

  // Stream directly to file server
  const fileServerUrl = `http://${gateway.appName}.fly.dev:8080/upload?path=${encodeURIComponent(filePath)}`;
  
  const response = await fetch(fileServerUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gateway.token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: file.stream(),
  });

  return NextResponse.json(await response.json());
}
```

---

## Implementation Steps

### Phase 1: File Server (1-2h)
1. Create `docker/file-server.js`
2. Update `docker/entrypoint.sh` to start file server
3. Update `docker/Dockerfile`
4. Build and push new image

### Phase 2: Fly Config (30min)
1. Update fly.toml if needed for internal port
2. Update user machines to use new image

### Phase 3: API Integration (1-2h)
1. Update `/api/files/upload` to proxy to file server
2. Update `/api/files/download` to proxy to file server
3. Update `/api/files/list` to use file server (faster than exec)
4. Remove exec-based file operations

### Phase 4: Testing (1h)
1. Test small file upload (<1MB)
2. Test large file upload (10MB+)
3. Test concurrent uploads
4. Test error handling

---

## Benefits

| Aspect | Exec Approach | File Server |
|--------|---------------|-------------|
| Speed | Slow (shell overhead) | Fast (direct I/O) |
| Reliability | Fragile (escaping issues) | Robust (streaming) |
| Size limit | ~5MB practical | 50MB+ |
| Complexity | High (chunking, cleanup) | Low (simple HTTP) |
| Concurrent | Poor | Good |

---

## Alternative: R2/S3 for Large Files

For very large files (100MB+), consider:
1. Upload to R2/S3 from browser (presigned URL)
2. Agent downloads from R2/S3 when needed
3. Best for: videos, datasets, archives

But for typical workspace files (images, documents <50MB), the file server is sufficient.

---

## Timeline

| Task | Estimate |
|------|----------|
| File server implementation | 2h |
| Docker rebuild | 30min |
| API integration | 2h |
| Testing | 1h |
| **Total** | **5-6h** |

---

## Decision

**Recommended:** Implement file server in Docker image.

Provides robust, fast, reliable file operations without exec API limitations. Single implementation handles all file operations (upload, download, list, delete).
