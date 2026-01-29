# Moltbot Sandbox Container Debugging

**Issue:** Chat UI hangs at "Connecting" - WebSocket connection established but container fails to start gateway

## Symptoms
1. WebSocket connects to `wss://moltbot-sandbox.alex-0bb.workers.dev/ws?...`
2. Auth via signed URL works (skipping CF Access)
3. Container fails with `SandboxError: HTTP error! status: 500`
4. Error happens in `createSession` before even running `startProcess`
5. Durable Object resets after each deploy

## Error Chain
```
listProcesses → HTTP 500
startProcess → createSession → HTTP 500
"Durable Object reset because its code was updated"
```

## Current State (2026-01-29)
- **Secrets set:** ANTHROPIC_API_KEY ✓, MOLTBOT_GATEWAY_TOKEN ✓, CF_ACCESS_* ✓
- **R2 storage:** NOT configured (missing R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CF_ACCOUNT_ID)
- **Container image:** Builds successfully (cached layers)
- **Worker deploys:** Successfully

## Hypotheses

### H1: Container not warming up properly
The Cloudflare sandbox container might need explicit warming. The 500 error from `createSession` suggests the container runtime itself isn't ready.

**Test:** Wait longer after deploy, or add a warmup endpoint that doesn't require process start.

### H2: R2 mount failure causing cascade
The R2 mount is failing (missing secrets), and maybe this is causing downstream issues even though it's supposed to be optional.

**Test:** Configure R2 secrets properly.

### H3: DO reset loop
After deploy, the DO resets and container restarts. If something in startup fails, it might keep resetting.

**Test:** Check if alarm keeps firing, indicating a restart loop.

### H4: Container image issue
Something in the Dockerfile or startup script might be failing silently.

**Test:** Add health check that doesn't require gateway start.

## Next Steps

1. **Configure R2 storage** - Eliminate as a variable
2. **Add container health endpoint** - Test if container is even running
3. **Check if clawdbot binary works** - Run a simple version check
4. **Review container logs** - See if there's stderr from container itself

## Commands

```bash
# Set R2 secrets
CLOUDFLARE_API_TOKEN="6rvHQcz-cjnMlkpJHRgwWijT2nVQFODJ4IDaSj8k"
echo "value" | wrangler secret put R2_ACCESS_KEY_ID
echo "value" | wrangler secret put R2_SECRET_ACCESS_KEY  
echo "0bb27f91691935c953044c143a47fbc3" | wrangler secret put CF_ACCOUNT_ID

# Tail logs
wrangler tail --format=pretty

# Test health
curl https://moltbot-sandbox.alex-0bb.workers.dev/sandbox-health
```

## R2 Setup Needed

1. Create R2 API Token at: https://dash.cloudflare.com/?account=0bb27f91691935c953044c143a47fbc3&to=/:account/r2/api-tokens
2. Generate Access Key ID and Secret Access Key
3. Set as secrets via wrangler
