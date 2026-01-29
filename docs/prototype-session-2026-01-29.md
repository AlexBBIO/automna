# Prototype Session Notes - 2026-01-29

## Goal
Connect custom chat UI (automna.ai/chat) to Clawdbot Gateway running in Docker container via Cloudflare Tunnel.

---

## What We Did

### 1. Gateway Configuration
- Added `trustedProxies` to accept connections from Docker bridge network
- Enabled `allowInsecureAuth` for Control UI (HTTP token auth)
- Set static test token: `test123`

**Config (`docker/config/clawdbot.json`):**
```json
{
  "gateway": {
    "auth": { "token": "test123" },
    "controlUi": { "allowInsecureAuth": true },
    "trustedProxies": ["172.17.0.1", "172.17.0.0/16", "127.0.0.1"]
  }
}
```

### 2. Frontend Changes
- Fixed WebSocket event structure (state vs status)
- Removed `useSearchParams()` (caused Suspense remounts)
- Moved /chat to route group without ClerkProvider
- Rewrote WebSocket hook for stability

### 3. Cloudflare Tunnel
- Tunnel routes `test.automna.ai` → `localhost:3001` → container:18789

---

## Issues Encountered

| Issue | Cause | Fix |
|-------|-------|-----|
| "Proxy headers from untrusted address" | Docker bridge IP not in trustedProxies | Added 172.17.0.1 to trustedProxies |
| "must have required property 'idempotencyKey'" | Missing param in chat.send | Added idempotencyKey to requests |
| Chat events not parsed | Wrong field names (status vs state) | Changed to state:delta/final, message.content[0].text |
| WebSocket closes immediately (1005) | useEffect deps causing remounts | Removed callbacks from deps, used refs |
| Component unmounts after 200ms | useSearchParams triggers Suspense | Replaced with window.location.search |
| Still unmounting | ClerkProvider initialization | Moved to (test) route group without Clerk |

---

## Security Analysis

### Current State (PROTOTYPE ONLY)
| Setting | Value | Risk | Production Fix |
|---------|-------|------|----------------|
| Gateway token | `test123` (hardcoded) | HIGH - predictable | Generate random token per user |
| Token in URL | `?token=test123` | MEDIUM - visible in logs/history | Use secure cookie or header |
| allowInsecureAuth | `true` | MEDIUM - no device identity | Use HTTPS + device pairing |
| /chat without Clerk | No session protection | LOW - gateway has its own auth | Can add Clerk back after WebSocket fix |
| trustedProxies | Docker + localhost | LOW - appropriate for Docker | Restrict to actual proxy IPs |

### What's NOT Less Secure
- Gateway still requires token auth (can't connect without valid token)
- Cloudflare Tunnel provides HTTPS (wss://)
- Each user container will have unique token
- Removing Clerk from /chat doesn't expose anything - gateway auth is separate

### Production Requirements
1. **Per-user tokens**: Generate unique gateway token on container creation
2. **Token delivery**: After Clerk auth, securely pass gateway token to frontend
3. **No URL tokens**: Use Authorization header or secure cookie
4. **Remove allowInsecureAuth**: Require HTTPS + device identity
5. **Rate limiting**: Add rate limits to gateway

---

## API Protocol Reference

### WebSocket Handshake
1. Client connects to `wss://gateway-url`
2. Server sends `connect.challenge` event
3. Client sends `connect` request with auth token
4. Server sends `hello-ok` response

### Chat Messages
**Send:**
```json
{
  "type": "req",
  "method": "chat.send",
  "params": {
    "sessionKey": "main",
    "message": "Hello",
    "idempotencyKey": "uuid"
  }
}
```

**Receive (streaming):**
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "state": "delta",  // or "final"
    "message": {
      "role": "assistant",
      "content": [{"type": "text", "text": "..."}]
    }
  }
}
```

---

## React/Next.js Lessons

1. **Don't use `useSearchParams()` with WebSockets** - causes Suspense remounts
2. **Don't include callbacks in useEffect deps** - causes reconnection loops
3. **Use refs for stable values** - avoids stale closures
4. **Check `mountedRef.current` before state updates** - prevents updates on unmounted components
5. **ClerkProvider can cause initial remounts** - isolate WebSocket routes if needed

---

## Files Changed

- `landing/src/lib/clawdbot-runtime.ts` - WebSocket hook (rewritten)
- `landing/src/components/AutomnaChat.tsx` - Chat UI component
- `landing/src/app/(test)/chat/page.tsx` - Test chat page
- `landing/src/app/(test)/layout.tsx` - Layout without Clerk
- `docker/config/clawdbot.json` - Gateway config
- `docs/gateway-chat-integration.md` - Integration guide

---

## Current Status
- Gateway: ✅ Working (verified via Python)
- Cloudflare Tunnel: ✅ Working
- Frontend: 🔄 Testing (improved but may still have remount issues)

## Next Steps
1. Test if current deploy works
2. If still failing, may need to debug browser console directly
3. Once working, document final working configuration
4. Create production-ready version with proper auth flow
