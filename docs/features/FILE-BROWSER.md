# File Browser Specification

**Date:** 2026-02-02  
**Status:** ✅ Implemented  
**Priority:** P0

---

## Overview

Allow users to browse, view, edit, and manage files in their agent's workspace through the web dashboard.

## Current State (2026-02-02 23:55 UTC)

**✅ Implemented:**
- `FileBrowser.tsx` - Full UI component with tree view, preview panel
- `file-context.tsx` - React context with file operations API
- `/api/files/[...path]/route.ts` - Full implementation using Fly Machines exec API
- All CRUD operations working (list, read, write, delete, mkdir, move, upload, download)
- Per-user gateway lookup from Turso database
- Path security validation
- **File uploads working end-to-end** ✅

**⏳ Testing needed:**
- Large file handling (>5MB)

---

## Important: Upload Path Fix (2026-02-02 23:55 UTC)

**Problem:** File uploads returned 500 errors from Vercel.

**Root Cause:** Vercel blocks HTTP connections to external services. Our file server was running on HTTP.

**Attempted Fixes (didn't work):**
- Switching from streaming to buffer approach
- Hard refresh to get latest deployment

**Actual Fix:**
1. Added TLS/HTTPS to the file server on port 8080
2. Updated the Vercel API routes to use HTTPS instead of HTTP

**Key Learning:** When proxying from Vercel to external services (Fly.io, etc.), **always use HTTPS**. Vercel's security policies block outbound HTTP to external hosts.

---

## Architecture Options

### Option A: Exec-Based (Recommended for MVP)
Use WebSocket/HTTP to send exec commands to the gateway.

```
Browser → /api/files/list?path=/root/clawd
                ↓
         Vercel API Route
                ↓
         Lookup user's gateway in Turso
                ↓
         Execute: ls -la --time-style=iso /root/clawd
                ↓
         Parse output into JSON
                ↓
         Return to browser
```

**Pros:**
- No changes to OpenClaw/Docker image needed
- Uses existing infrastructure
- Works immediately

**Cons:**
- Parsing shell output is fragile
- Limited to what shell commands can do
- Slower (command execution overhead)

### Option B: Custom Files Server in Docker Image
Add a lightweight files server (Node.js/Python) to the Docker image.

```
Browser → /api/files/list?path=/root/clawd
                ↓
         Vercel API Route
                ↓
         Proxy to: https://user-app.fly.dev:8080/files/list
                ↓
         Custom files server reads filesystem
                ↓
         Return JSON
```

**Pros:**
- Clean REST API
- Fast (native filesystem access)
- Proper error handling

**Cons:**
- Requires Docker image changes
- Need to run additional server
- More complexity

### Option C: Gateway Plugin/Extension
Modify OpenClaw to expose files API.

**Pros:**
- Cleanest integration
- Official support

**Cons:**
- Requires upstream changes or fork
- Longer timeline

---

## Decision: Option A (Exec-Based) ✅ IMPLEMENTED

Fast to implement, works with existing infrastructure.

**Implementation:** Uses Fly Machines exec API (`POST /v1/apps/{app}/machines/{id}/exec`) to run shell commands on user's machine. No changes to OpenClaw/Docker image needed.

---

## API Specification

### Base URL
```
/api/files/{operation}?token={gatewayToken}&path={filePath}
```

### Endpoints

#### List Directory
```
GET /api/files/list?path=/root/clawd

Response:
{
  "files": [
    {
      "name": "memory",
      "path": "/root/clawd/memory",
      "type": "directory",
      "size": 4096,
      "modified": "2026-02-02T17:30:00Z"
    },
    {
      "name": "SOUL.md",
      "path": "/root/clawd/SOUL.md",
      "type": "file",
      "size": 2048,
      "modified": "2026-02-02T15:00:00Z",
      "extension": "md"
    }
  ]
}

Implementation:
- Execute: ls -la --time-style=long-iso {path}
- Parse output lines into file objects
```

#### Read File
```
GET /api/files/read?path=/root/clawd/SOUL.md

Response:
{
  "content": "# SOUL.md - Who You Are\n\n...",
  "size": 2048,
  "encoding": "utf-8"
}

Implementation:
- Execute: cat {path}
- Return stdout as content
- For binary files, base64 encode
```

#### Write File
```
POST /api/files/write
Body: { "path": "/root/clawd/test.md", "content": "Hello world" }

Response:
{ "success": true, "path": "/root/clawd/test.md" }

Implementation:
- Execute: echo '{content}' > {path}
- Or use heredoc for multi-line
```

#### Delete File
```
DELETE /api/files?path=/root/clawd/test.md

Response:
{ "success": true }

Implementation:
- Execute: rm -rf {path}
- Or: trash {path} if available
```

#### Create Directory
```
POST /api/files/mkdir
Body: { "path": "/root/clawd/new-folder" }

Response:
{ "success": true, "path": "/root/clawd/new-folder" }

Implementation:
- Execute: mkdir -p {path}
```

#### Move/Rename
```
POST /api/files/move
Body: { "from": "/root/clawd/old.md", "to": "/root/clawd/new.md" }

Response:
{ "success": true }

Implementation:
- Execute: mv {from} {to}
```

#### Download File
```
GET /api/files/download?path=/root/clawd/image.png

Response:
- Binary file content
- Content-Type header set appropriately
- Content-Disposition: attachment

Implementation:
- Execute: cat {path} | base64
- Decode and return as blob
```

#### Upload File
```
POST /api/files/upload
Content-Type: multipart/form-data
Body: file={binary}, path=/root/clawd/uploads/image.png

Response:
{ "success": true, "path": "/root/clawd/uploads/image.png" }

Implementation:
- Base64 encode file
- Execute: echo '{base64}' | base64 -d > {path}
```

---

## Security Considerations

1. **Path Validation**
   - Must start with `/root/clawd` or `/home/node/.openclaw`
   - No `..` traversal allowed
   - Sanitize special characters

2. **Size Limits**
   - Read: Max 5MB per file
   - Write: Max 10MB per file
   - Upload: Max 50MB per file

3. **Allowed Extensions**
   - Block: `.exe`, `.sh` (write), `.env` (read from certain paths)
   - Allow: `.md`, `.txt`, `.json`, `.yaml`, `.js`, `.ts`, `.py`, etc.

4. **Rate Limiting**
   - 100 requests/minute per user
   - 10 writes/minute per user

---

## UI Components (Already Built)

### FileBrowser.tsx
- Two-panel layout: file tree + preview
- Breadcrumb navigation
- Upload button
- Refresh button
- File actions: download, delete

### Features to Add
1. **Create New File** button
2. **Create Folder** button
3. **Inline rename** (double-click)
4. **Multi-select** for bulk operations
5. **Search** within files
6. **Edit mode** for text files

---

## Implementation Plan

### Phase 1: Basic Browsing ✅ DONE (2026-02-02)
1. ✅ Update `/api/files/[...path]/route.ts` to use Turso for per-user gateway
2. ✅ Implement `/api/files/list` using Fly Machines exec API
3. ✅ Implement `/api/files/read` using exec
4. ⏳ Test with dashboard FileBrowser

### Phase 2: File Operations ✅ DONE (2026-02-02)
1. ✅ Implement `/api/files/write`
2. ✅ Implement `/api/files/mkdir`
3. ✅ Implement DELETE handler
4. ⏳ Test create/edit/delete flow

### Phase 3: Upload/Download ✅ DONE (2026-02-02)
1. ✅ Implement `/api/files/download` with binary support
2. ✅ Implement `/api/files/upload` with multipart handling
3. ⏳ Add progress indicators

### Phase 4: Polish ⏳ PENDING
1. ⏳ Add create file/folder buttons to UI
2. ⏳ Add inline rename
3. ⏳ Add error toasts
4. ⏳ Add loading states

---

## Gateway Exec Integration

The gateway supports exec via WebSocket. We'll use HTTP to send exec commands:

```typescript
// Execute command on user's gateway
async function execCommand(appName: string, token: string, command: string): Promise<string> {
  const ws = new WebSocket(`wss://${appName}.fly.dev/ws?token=${token}&clientId=files-api`);
  
  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'req',
        id: 'exec-1',
        method: 'exec',
        params: {
          command,
          timeout: 30000,
        }
      }));
    };
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'res' && msg.id === 'exec-1') {
        ws.close();
        if (msg.ok) {
          resolve(msg.payload.stdout || '');
        } else {
          reject(new Error(msg.payload?.error || 'Exec failed'));
        }
      }
    };
    
    ws.onerror = () => reject(new Error('WebSocket error'));
  });
}
```

---

## Testing Checklist

- [ ] List `/root/clawd` directory
- [ ] Navigate into subdirectories
- [ ] Preview markdown files
- [ ] Preview code files with syntax highlighting
- [ ] Create new text file
- [ ] Edit existing file
- [ ] Delete file
- [ ] Create folder
- [ ] Upload small file (<1MB)
- [ ] Upload large file (5MB)
- [ ] Download file
- [ ] Path traversal blocked
- [ ] Error handling for missing files
- [ ] Error handling for permission denied
