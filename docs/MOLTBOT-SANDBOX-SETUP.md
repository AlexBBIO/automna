# Moltbot Sandbox Setup Guide

**Status:** ✅ Working (2026-01-29)

## Architecture

```
automna.ai (Vercel)
    └── Dashboard with Clerk auth
    └── Generates signed URLs (userId/exp/sig)
            │
            ▼
moltbot-sandbox.alex-0bb.workers.dev (Cloudflare Worker)
    └── Validates signed URL
    └── Creates per-user Durable Object sandbox
    └── Proxies WebSocket to container
    └── **Injects gateway token** into connect message
            │
            ▼
Container (Cloudflare Containers)
    └── Runs clawdbot gateway on port 18789
    └── Handles chat sessions
    └── Uses ANTHROPIC_API_KEY for Claude
```

## Key Fix: Token Injection

The critical fix was in `src/index.ts` - the worker intercepts the WebSocket `connect` message and injects the gateway token:

```typescript
// Intercept connect message and inject gateway token
if (typeof event.data === 'string' && gatewayToken) {
  try {
    const msg = JSON.parse(event.data);
    if (msg.method === 'connect') {
      msg.params = msg.params || {};
      msg.params.auth = msg.params.auth || {};
      msg.params.auth.token = gatewayToken;
      dataToSend = JSON.stringify(msg);
    }
  } catch (e) { /* Not JSON */ }
}
```

This allows the signed URL auth (validated at worker level) to translate into gateway token auth (required by clawdbot).

## Secrets Required

Set via `wrangler secret put <NAME>`:

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API key |
| `MOLTBOT_GATEWAY_TOKEN` | ✅ | Token for gateway auth (injected into WebSocket) |
| `CF_ACCOUNT_ID` | ⚠️ | For R2 storage (optional but recommended) |
| `R2_ACCESS_KEY_ID` | ⚠️ | For R2 persistent storage |
| `R2_SECRET_ACCESS_KEY` | ⚠️ | For R2 persistent storage |
| `CF_ACCESS_TEAM_DOMAIN` | ⚠️ | For CF Access (set to placeholder if not using) |
| `CF_ACCESS_AUD` | ⚠️ | For CF Access (set to placeholder if not using) |

## Deployment

```bash
cd /root/clawd/projects/automna/moltworker
CLOUDFLARE_API_TOKEN="6rvHQcz-cjnMlkpJHRgwWijT2nVQFODJ4IDaSj8k"

# Build and deploy
npm run build
wrangler deploy

# Force container rebuild (if needed)
echo "$(date +%s)" >> start-moltbot.sh
wrangler deploy
```

## Troubleshooting

### "device identity required" error
- **Cause:** Gateway token not injected into connect message
- **Fix:** Ensure MOLTBOT_GATEWAY_TOKEN secret is set

### Container startup fails (HTTP 500)
- **Cause:** Container image stale or DO in bad state
- **Fix:** Force rebuild by modifying start-moltbot.sh

### WebSocket times out
- **Cause:** Container cold start taking too long
- **Fix:** Wait ~30s after deploy, or hit /sandbox-health to warm up

### "Durable Object reset"
- **Cause:** Normal after deploy - container restarts
- **Fix:** This is expected, subsequent requests should work

## Config Files

- **Secrets:** `/root/clawd/projects/automna/config/secrets.json` (chmod 600)
- **Cloudflare tokens:** `/root/clawd/projects/automna/config/cloudflare.json`
- **Gateway template:** `moltworker/moltbot.json.template`
- **Startup script:** `moltworker/start-moltbot.sh`

## Logs

```bash
# Watch live logs
wrangler tail --format=pretty

# Key log lines to look for:
# ✅ "[WS] Injected gateway token into connect message"
# ✅ "Moltbot gateway is reachable"
# ✅ "[HTTP] Response status: 200"
```
