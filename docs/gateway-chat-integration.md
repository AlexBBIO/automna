# Gateway Chat Integration Guide

How to connect a custom chat UI to Clawdbot's Gateway WebSocket API.

**Last Updated:** 2026-01-29

---

## Overview

Clawdbot Gateway exposes a WebSocket API for chat. The Control UI and custom frontends connect to this API to send/receive messages.

## Architecture

```
Frontend (React/Next.js)
    ↓ WebSocket
Gateway Container (Clawdbot)
    ↓ API calls
LLM Provider (Anthropic, etc.)
```

## Connection Flow

### 1. WebSocket Connect

```javascript
const ws = new WebSocket('wss://your-gateway.example.com');
// or ws://localhost:18789 for local
```

### 2. Receive Challenge

Gateway sends a challenge event immediately:

```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": { "nonce": "...", "ts": 1234567890 }
}
```

### 3. Send Connect Request

**Required fields:**
- `minProtocol` / `maxProtocol`: Use `3` for current protocol
- `client.id`: Must be `clawdbot-control-ui` (whitelisted)
- `client.mode`: Use `webchat`
- `role`: Use `operator`
- `scopes`: `["operator.read", "operator.write"]`
- `auth.token`: Your gateway token

```json
{
  "type": "req",
  "id": "unique-id",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "clawdbot-control-ui",
      "version": "vdev",
      "platform": "linux",
      "mode": "webchat"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "caps": [],
    "commands": [],
    "permissions": {},
    "locale": "en-US",
    "auth": { "token": "your-token" }
  }
}
```

### 4. Receive Hello

```json
{
  "type": "res",
  "id": "...",
  "ok": true,
  "payload": { "type": "hello-ok", "protocol": 3, ... }
}
```

## Sending Messages

### chat.send

**Required params:**
- `sessionKey`: Session identifier (e.g., `"main"`)
- `message`: The user's message text
- `idempotencyKey`: Unique ID for deduplication

```json
{
  "type": "req",
  "id": "msg-1",
  "method": "chat.send",
  "params": {
    "sessionKey": "main",
    "message": "Hello!",
    "idempotencyKey": "uuid-here"
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "msg-1",
  "ok": true,
  "payload": { "runId": "...", "status": "started" }
}
```

## Receiving Responses

Responses stream via `chat` and `agent` events.

### Chat Events

**Delta (streaming):**
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "...",
    "sessionKey": "main",
    "state": "delta",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "Partial response..." }]
    }
  }
}
```

**Final (complete):**
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "...",
    "sessionKey": "main",
    "state": "final",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "Complete response" }]
    }
  }
}
```

### Agent Events

Tool use and lifecycle events:

```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "...",
    "stream": "lifecycle",  // or "assistant", "tool"
    "data": { "phase": "start" }
  }
}
```

## Gateway Configuration

### Required Config (clawdbot.json)

```json
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": {
      "token": "your-secure-token"
    },
    "controlUi": {
      "allowInsecureAuth": true
    },
    "trustedProxies": ["172.17.0.1", "172.17.0.0/16", "127.0.0.1"]
  }
}
```

### Cloudflare Tunnel Setup

1. Create tunnel: `cloudflared tunnel create automna`
2. Configure `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: your-tunnel-id
   credentials-file: /path/to/credentials.json
   ingress:
     - hostname: test.automna.ai
       service: http://127.0.0.1:3001
     - service: http_status:404
   ```
3. Route DNS: `cloudflared tunnel route dns automna test.automna.ai`
4. Run: `cloudflared tunnel run automna`

### Docker Port Mapping

```bash
docker run -p 3001:18789 your-clawdbot-image
```

## Common Issues

### "Proxy headers detected from untrusted address"
**Fix:** Add Docker bridge IP to `trustedProxies`:
```json
"trustedProxies": ["172.17.0.1", "172.17.0.0/16"]
```

### "invalid chat.send params: must have required property 'idempotencyKey'"
**Fix:** Add `idempotencyKey` (UUID) to chat.send params.

### "invalid connect params: at /client/id"
**Fix:** Use `clawdbot-control-ui` as client.id (other values not allowed).

### Connection closes immediately (code 1005/1006)
**Causes:**
- Auth token mismatch
- Missing trustedProxies config
- Tunnel configuration issue

### Events not received
**Check:**
- Correct event field names (`state` not `status`)
- Message content path: `payload.message.content[0].text`

## React Hook Example

See `/src/lib/clawdbot-runtime.ts` for full implementation.

Key points:
- Use `useCallback` for WebSocket message handler
- Track connection state with refs (avoid re-renders during streaming)
- Accumulate streaming content in a ref, update state on deltas
- Clean up WebSocket on unmount

---

## Checklist for New Deployments

- [ ] Gateway container running with correct env vars (API keys)
- [ ] `clawdbot.json` mounted with auth token
- [ ] `trustedProxies` includes Docker/proxy IPs
- [ ] Cloudflare tunnel pointing to correct port
- [ ] DNS configured for tunnel hostname
- [ ] Frontend using correct WebSocket URL (wss:// for tunnel)
- [ ] Frontend sending `idempotencyKey` with chat.send
- [ ] Frontend handling `state: delta/final` (not `status`)
