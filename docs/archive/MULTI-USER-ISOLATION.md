# Multi-User Isolation Architecture

**Last Updated:** 2026-01-31
**Status:** Working (verified)

## Overview

Each Automna user gets their own isolated sandbox environment:
- Separate Durable Object (DO)
- Separate container instance
- Separate R2 storage path
- Separate Clawdbot/Moltbot gateway process

## Architecture

```
User (Clerk) → Signed URL → Worker → Per-User DO → Per-User Container → Per-User R2 Path
     ↓              ↓           ↓          ↓              ↓                    ↓
grandathrawn   userId=abc   validates   DO "user-abc"  Container A    /data/moltbot/users/abc
alex@wilkinson userId=xyz   signature   DO "user-xyz"  Container B    /data/moltbot/users/xyz
```

## Key Components

### 1. Signed URLs (Frontend → Worker)

The Vercel frontend generates signed URLs with Clerk user IDs:

```
wss://moltbot-sandbox.../ws?userId={clerkUserId}&exp={timestamp}&sig={hmacSignature}
```

**Signature format:** `HMAC-SHA256(userId.exp, MOLTBOT_SIGNING_SECRET)`

**Files:**
- Frontend: `/landing/src/lib/moltbot.ts` - `generateSignedWebSocketUrl()`
- Worker: `/moltworker/src/auth/signed-url.ts` - `validateSignedUrl()`

### 2. Per-User Durable Objects (Worker)

The worker middleware creates per-user sandbox IDs:

```typescript
// src/index.ts middleware
const sandboxId = `user-${validation.userId}`.toLowerCase();
const sandbox = getSandbox(env.Sandbox, sandboxId, options);
```

**Important:** Sandbox ID is lowercased to avoid Cloudflare hostname issues.

### 3. Per-User R2 Paths (Container)

The startup script uses the `MOLTBOT_USER_ID` env var to set isolated paths:

```bash
# start-moltbot.sh
if [ -n "$MOLTBOT_USER_ID" ]; then
    BACKUP_DIR="/data/moltbot/users/$MOLTBOT_USER_ID"
else
    BACKUP_DIR="/data/moltbot"  # Shared/admin fallback
fi
```

**R2 bucket structure:**
```
moltbot-data/
├── .last-sync              # Admin/shared sync timestamp
├── users/
│   ├── user_abc123/        # User 1
│   │   ├── config/
│   │   │   └── clawdbot.json
│   │   ├── workspace/
│   │   │   └── ...
│   │   └── .last-sync
│   └── user_xyz789/        # User 2
│       ├── config/
│       ├── workspace/
│       └── .last-sync
└── (legacy flat structure for migration)
```

### 4. Environment Variable Passing

The worker passes `MOLTBOT_USER_ID` to the container:

```typescript
// src/gateway/env.ts - buildEnvVars()
if (userId) {
    vars.MOLTBOT_USER_ID = userId;
}
```

## What Broke & How We Fixed It

### Issue 1: Shared R2 Path (CRITICAL)

**Symptom:** All users shared the same config/data. User A could see User B's conversations.

**Root cause:** `start-moltbot.sh` had a hardcoded shared path:
```bash
# WRONG - MVP placeholder that was never updated
BACKUP_DIR="/data/moltbot"
```

**Fix:** Use per-user path based on MOLTBOT_USER_ID env var:
```bash
# CORRECT
if [ -n "$MOLTBOT_USER_ID" ]; then
    BACKUP_DIR="/data/moltbot/users/$MOLTBOT_USER_ID"
fi
```

### Issue 2: max_instances Limit

**Symptom:** "Maximum number of running container instances exceeded" error. Only one user could connect at a time.

**Root cause:** `wrangler.jsonc` had `max_instances: 1`

**Fix:** Increased to `max_instances: 10` (adjust based on expected concurrent users)

### Issue 3: Deploy Resets (Expected Behavior)

**Symptom:** "Durable Object reset because its code was updated" errors after every deploy.

**Root cause:** Normal Cloudflare behavior. When you deploy new code, all DOs reset.

**Mitigation:** 
- Accept errors during development
- Cron jobs and in-flight requests will fail during deploy window (~60s)
- For production: use staging/production separation, deploy less frequently

### Issue 4: Cold Start Latency

**Symptom:** First connection takes 30-90 seconds.

**Root cause:** Container needs to:
1. Start the Docker container
2. Mount R2 storage
3. Restore config from R2
4. Start Clawdbot gateway
5. Wait for port to be ready

**Mitigation:**
- Configure `sleepAfter` in wrangler.jsonc to keep containers warm
- Or accept cold starts as part of serverless tradeoff

## Configuration Reference

### wrangler.jsonc

```jsonc
{
  "containers": [{
    "class_name": "Sandbox",
    "image": "./Dockerfile",
    "instance_type": "standard-4",
    "max_instances": 10  // Scale based on expected concurrent users
  }],
  "durable_objects": {
    "bindings": [{
      "class_name": "Sandbox",
      "name": "Sandbox"
    }]
  }
}
```

### Required Secrets

```bash
wrangler secret put MOLTBOT_SIGNING_SECRET  # For URL signing
wrangler secret put ANTHROPIC_API_KEY        # For LLM
wrangler secret put R2_ACCESS_KEY_ID         # For R2 mount
wrangler secret put R2_SECRET_ACCESS_KEY     # For R2 mount
wrangler secret put CF_ACCOUNT_ID            # For R2 endpoint
```

### Environment Variables (Vercel Frontend)

```
MOLTBOT_WORKER_URL=https://moltbot-sandbox.alex-0bb.workers.dev
MOLTBOT_SIGNING_SECRET=<same as worker secret>
```

## Debugging

### Check Active DOs

```bash
CF_TOKEN="..." CF_ACCOUNT_ID="..."
NAMESPACE_ID="804d8d929d474b279dd9a343345a7cfa"

curl -s "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/durable_objects/namespaces/${NAMESPACE_ID}/objects" \
  -H "Authorization: Bearer $CF_TOKEN" | jq '.result'
```

### Check User's Container Status

```bash
# Generate signed URL and hit /api/status
curl "https://moltbot-sandbox.../api/status?userId=...&exp=...&sig=..."
```

### View Logs

```bash
cd moltworker && npx wrangler tail --format pretty
```

Look for:
- `[SANDBOX] Creating per-user sandbox: user-{id}` - Per-user DO creation
- `Using per-user backup path: /data/moltbot/users/{id}` - Correct R2 path
- `[Gateway] Moltbot gateway is ready!` - Successful startup

## Scaling Considerations

### Current Limits

| Resource | Current | Max | Notes |
|----------|---------|-----|-------|
| max_instances | 10 | ? | Cloudflare limit TBD |
| Container type | standard-4 | standard-16 | Can upgrade for more RAM |
| R2 storage | Shared bucket | - | Paths isolated per user |
| DOs per account | 4 active | Unlimited | DOs created on demand |

### Scaling Recommendations

1. **Horizontal:** Increase `max_instances` as user count grows
2. **Vertical:** Upgrade `instance_type` if containers OOM
3. **Storage:** R2 scales automatically, no action needed
4. **Cold starts:** Consider keep-alive for VIP users or during peak hours

### Cost Estimates

- **Containers:** ~$0.005/container-second (standard-4)
- **R2 Storage:** ~$0.015/GB/month
- **R2 Operations:** Free first 1M, then ~$0.36/million
- **DO Duration:** First 400K GB-sec free, then ~$0.0000125/GB-sec

## Security Checklist

- [x] URLs signed with HMAC-SHA256
- [x] Signature expiration enforced
- [x] User ID format validated (must start with `user_`)
- [x] Per-user R2 paths (users can't access others' data)
- [x] Gateway token per container
- [ ] Rate limiting (TODO)
- [ ] Abuse detection (TODO)

## Future Improvements

1. **Graceful deploy handling:** Add retry logic for "code was updated" errors
2. **Pre-warming:** Start containers proactively for known active users
3. **Monitoring:** Alert on unusual DO/container counts
4. **Cleanup:** Cron job to delete inactive user data from R2
5. **Backup:** Periodic full R2 bucket backup
