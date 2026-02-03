# Reverse Proxy Architecture

**Created:** 2026-02-03  
**Status:** ✅ Implemented

---

## Overview

Automna uses a single-port architecture with Caddy as a reverse proxy. This is the standard pattern used by AWS, GCP, Vercel, and other mainstream services.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS :443
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Fly.io Edge                               │
│                    (TLS termination)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP :18789
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Caddy Reverse Proxy                            │
│                      (port 18789)                                │
│                                                                  │
│  ┌────────────────────┐    ┌────────────────────┐               │
│  │  handle_path       │    │  handle            │               │
│  │  /files/*          │    │  /* (everything)   │               │
│  │  → strip prefix    │    │                    │               │
│  │  → localhost:8080  │    │  → localhost:18788 │               │
│  └────────────────────┘    └────────────────────┘               │
└────────────────────────────────────────────────────────────────-┘
           │                              │
           ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────────────────┐
│    File Server      │    │         OpenClaw Gateway            │
│  (localhost:8080)   │    │       (localhost:18788)             │
│                     │    │                                     │
│  - Upload/download  │    │  - WebSocket chat                   │
│  - List directories │    │  - Agent execution                  │
│  - Read/write files │    │  - Tool invocation                  │
│  - 100MB max upload │    │  - Heartbeat handling               │
└─────────────────────┘    └─────────────────────────────────────┘
```

---

## Why This Architecture?

### Industry Standard
Every major cloud service uses single-port with internal routing:
- AWS API Gateway → Lambda/ECS
- GCP Cloud Run → internal services
- Vercel → serverless functions
- GitHub API → internal microservices

### Security Benefits
1. **Minimal attack surface** - One port exposed, not multiple
2. **Defense in depth** - Internal services not directly accessible
3. **Unified auth** - Single point for token validation
4. **Easier firewall rules** - Only one port to allow

### Operational Benefits
1. **Single TLS termination** - Fly handles HTTPS
2. **Centralized logging** - All traffic through one proxy
3. **Easy routing changes** - Update Caddyfile, no infra changes
4. **Standard tooling** - Caddy is battle-tested, widely used

---

## Components

### Caddy Reverse Proxy

**Location:** `/etc/caddy/Caddyfile` (in Docker image)

**Source:** `docker/Caddyfile`

```caddyfile
:18789 {
    # Large file uploads (100MB max)
    request_body {
        max_size 100MB
    }

    # File server routes - strip /files prefix before forwarding
    handle_path /files/* {
        reverse_proxy localhost:8080
    }

    # Everything else goes to OpenClaw gateway
    handle {
        reverse_proxy localhost:18788
    }

    # Logging
    log {
        output stdout
        format console
        level WARN
    }
}
```

**Key Points:**
- `handle_path` strips the matched prefix (`/files`) before forwarding
- Request body limit set to 100MB for large uploads
- WebSocket connections handled natively by Caddy
- Logging at WARN level to reduce noise

### File Server

**Location:** `/app/file-server.cjs` (in Docker image)

**Source:** `docker/file-server.cjs`

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/list?path=...` | List directory contents |
| GET | `/read?path=...` | Read file content |
| GET | `/download?path=...` | Download file (binary) |
| POST | `/write?path=...` | Write file content |
| POST | `/mkdir?path=...` | Create directory |
| POST | `/move` | Move/rename file |
| POST | `/upload?path=...` | Upload file (binary) |
| DELETE | `/delete?path=...` | Delete file/directory |

**Security:**
- Requires `token` query parameter matching `OPENCLAW_GATEWAY_TOKEN`
- Path validation - only `/home/node/.openclaw` allowed
- No path traversal (`..` rejected)
- Max upload size: 50MB default (configurable)

### OpenClaw Gateway

**Port:** 18788 (internal only, was 18789 before Caddy)

**Handles:**
- WebSocket connections (`/ws`)
- Chat API
- Agent execution
- Tool invocation
- Heartbeat system
- Control UI

---

## Request Flow Examples

### File List Request

```
1. Browser: GET https://automna-u-xxx.fly.dev/files/list?path=/home/node/.openclaw/workspace&token=xxx
2. Fly.io: TLS termination, forward to :18789
3. Caddy: Match /files/*, strip prefix, forward to localhost:8080
4. File Server: Receives GET /list?path=...&token=xxx
5. File Server: Validates token, lists directory, returns JSON
6. Response flows back through the chain
```

### WebSocket Chat

```
1. Browser: WSS wss://automna-u-xxx.fly.dev/ws?token=xxx
2. Fly.io: TLS termination, upgrade to WebSocket
3. Caddy: No /files prefix, forward to localhost:18788
4. Gateway: WebSocket upgrade, chat connection established
```

### File Upload

```
1. Browser: POST https://automna-u-xxx.fly.dev/files/upload?path=...&token=xxx
   Body: binary file data
2. Fly.io: TLS termination
3. Caddy: Match /files/*, check body size (<100MB), strip prefix
4. File Server: Receives POST /upload?path=...
5. File Server: Streams body to disk, returns success
```

---

## Configuration

### Docker Image

The Caddy setup is baked into the Docker image:

```dockerfile
# Install Caddy
RUN apt-get update && apt-get install -y caddy

# Copy config
COPY Caddyfile /etc/caddy/Caddyfile
```

### Entrypoint

The entrypoint starts all services:

```bash
# Start file server (internal)
node /app/file-server.cjs &

# Start Caddy (main entry point)
caddy run --config /etc/caddy/Caddyfile &

# Start gateway (internal)
exec node /app/dist/entry.js gateway --port 18788 ...
```

### Fly.io Services

Only one service exposed (Caddy on 18789):

```typescript
services: [
  {
    ports: [
      { port: 443, handlers: ["tls", "http"] },
      { port: 80, handlers: ["http"] },
    ],
    protocol: "tcp",
    internal_port: 18789,  // Caddy
  },
]
```

---

## Troubleshooting

### "Not Found" on /files/*

**Cause:** Caddy not stripping prefix correctly.

**Fix:** Ensure using `handle_path` not `handle`:
```caddyfile
# Wrong
handle /files/* {
    reverse_proxy localhost:8080
}

# Correct
handle_path /files/* {
    reverse_proxy localhost:8080
}
```

### WebSocket Connection Fails

**Cause:** Caddy not forwarding WebSocket upgrade.

**Check:** Caddy handles WebSocket natively, but ensure no middleware is blocking the upgrade.

### Large Upload Fails

**Cause:** Body size limit.

**Fix:** Increase limit in Caddyfile:
```caddyfile
request_body {
    max_size 100MB
}
```

### Auth Failures

**Cause:** Token not passed through.

**Check:** File server expects `token` in query params. Ensure Vercel API passes it:
```typescript
url.searchParams.set('token', gateway.token);
```

---

## Monitoring

### Logs

Caddy logs to stdout at WARN level:
```bash
fly logs -a automna-u-xxx | grep -i caddy
```

### Health Check

Test file server through Caddy:
```bash
curl "https://automna-u-xxx.fly.dev/files/list?token=xxx&path=/home/node/.openclaw/workspace"
```

Test gateway through Caddy:
```bash
curl "https://automna-u-xxx.fly.dev/api/health"
```

---

## Future Improvements

1. **Rate limiting** - Add Caddy rate limit module
2. **Request logging** - Enable access logs for debugging
3. **Health checks** - Caddy can health-check backends
4. **Metrics** - Export Prometheus metrics from Caddy
5. **Caching** - Cache static file responses
