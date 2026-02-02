# Fly.io Migration Plan

**Date:** 2026-02-02  
**Status:** Planning  
**Estimated Effort:** 3-5 days

---

## Executive Summary

This document details the complete migration from Cloudflare Sandbox to Fly.io for Automna's agent hosting infrastructure. The migration will enable true "always-on" agents while maintaining all existing functionality.

---

## Current Architecture Analysis

### Components Inventory

#### 1. Moltworker (Cloudflare Worker) — ~7,700 lines TypeScript

| File | Purpose | Migration Impact |
|------|---------|------------------|
| `src/index.ts` | Main routing, middleware, WebSocket proxy | HIGH - Core logic to rewrite |
| `src/routes/api.ts` | File APIs, history, keepalive | MEDIUM - Keep logic, change transport |
| `src/auth/signed-url.ts` | URL signing/validation | KEEP - Reuse as-is |
| `src/gateway/process.ts` | Container startup, health checks | REMOVE - Not needed |
| `src/gateway/r2.ts` | R2 bucket mounting | CHANGE - Direct S3 API instead |
| `src/gateway/sync.ts` | R2 sync via rsync | CHANGE - Different approach |
| `src/gateway/env.ts` | Environment variable building | KEEP - Minor changes |

#### 2. Container (Dockerfile + start-moltbot.sh)

| Component | Current | Migration |
|-----------|---------|-----------|
| Base image | `cloudflare/sandbox:0.7.0` | Standard `node:22` or `ubuntu` |
| Clawdbot | `npm install -g clawdbot@2026.1.24-3` | Same |
| R2 mount | s3fs via sandbox API | Direct S3 API or mounted volume |
| Startup | `start-moltbot.sh` | Simplified (no R2 restore) |

#### 3. Frontend (Vercel/Next.js)

| Component | Current | Migration |
|-----------|---------|-----------|
| `/api/user/gateway` | Returns signed URL to Moltworker | Returns signed URL to Fly |
| `ClawdbotRuntime` | WebSocket to Moltworker | WebSocket to Fly |
| `FileProvider` | HTTP to Moltworker /api/files/* | HTTP to Fly |

#### 4. Storage (R2)

| Data | Current Location | Migration |
|------|------------------|-----------|
| Chat history | `users/{userId}/clawdbot/...` | Fly Volume or S3 |
| Workspace files | `users/{userId}/workspace/...` | Fly Volume |
| Dir cache | `users/{userId}/dir-cache/...` | Local cache or Redis |
| Config | `users/{userId}/config/...` | Fly Volume |

#### 5. Secrets/Environment Variables

| Secret | Current | Migration |
|--------|---------|-----------|
| `ANTHROPIC_API_KEY` | CF Worker secret | Fly secret |
| `MOLTBOT_SIGNING_SECRET` | CF Worker + Vercel | Fly secret + Vercel |
| `MOLTBOT_GATEWAY_TOKEN` | CF Worker secret | Fly secret |
| `R2_ACCESS_KEY_ID` | CF Worker secret | S3 credentials or Fly Volume |
| `R2_SECRET_ACCESS_KEY` | CF Worker secret | S3 credentials or Fly Volume |
| `CF_ACCOUNT_ID` | CF Worker secret | Not needed |

---

## Fly.io Architecture

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Fly.io                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Fly Proxy (Edge)                             │    │
│  │         Routes requests by subdomain/path to machines            │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│        ┌──────────────────────┼──────────────────────┐                  │
│        │                      │                      │                  │
│        ▼                      ▼                      ▼                  │
│  ┌───────────┐         ┌───────────┐         ┌───────────┐             │
│  │ Machine A │         │ Machine B │         │ Machine C │   ...       │
│  │ (User A)  │         │ (User B)  │         │ (User C)  │             │
│  │           │         │           │         │           │             │
│  │ Clawdbot  │         │ Clawdbot  │         │ Clawdbot  │             │
│  │ Gateway   │         │ Gateway   │         │ Gateway   │             │
│  │ :18789    │         │ :18789    │         │ :18789    │             │
│  │           │         │           │         │           │             │
│  │ ┌───────┐ │         │ ┌───────┐ │         │ ┌───────┐ │             │
│  │ │Volume │ │         │ │Volume │ │         │ │Volume │ │             │
│  │ │/data  │ │         │ │/data  │ │         │ │/data  │ │             │
│  │ └───────┘ │         │ └───────┘ │         │ └───────┘ │             │
│  └───────────┘         └───────────┘         └───────────┘             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Vercel (Dashboard)                                    │
│                                                                         │
│  /api/user/gateway → Returns signed URL to user's Fly machine           │
│  /api/user/provision → Creates new Fly machine for user                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Differences from Current

| Aspect | Cloudflare | Fly.io |
|--------|------------|--------|
| **Container lifecycle** | Hibernates after ~5min | Always running |
| **Per-user isolation** | Durable Objects | Separate Machines |
| **Storage** | R2 (S3-compatible) | Fly Volumes (persistent disk) |
| **Networking** | Worker proxies to container | Direct connection to Machine |
| **Cold start** | 10-20s (container boot) | ~0s (always running) |
| **WebSocket** | Worker intercepts, proxies | Direct to Machine |

---

## Migration Steps

### Phase 1: Setup & Dockerfile (Day 1)

#### 1.1 Create Fly.io Account & App

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app (don't deploy yet)
fly apps create automna-agents
```

#### 1.2 Adapt Dockerfile

```dockerfile
# Dockerfile.fly
FROM node:22-slim

# Install required packages
RUN apt-get update && apt-get install -y \
    rsync \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Clawdbot
RUN npm install -g clawdbot@2026.1.24-3

# Create directories
RUN mkdir -p /root/.clawdbot /root/clawd /data

# Copy startup script (simplified for Fly)
COPY start-fly.sh /usr/local/bin/start-fly.sh
RUN chmod +x /usr/local/bin/start-fly.sh

# Copy config template
COPY moltbot.json.template /root/.clawdbot-templates/moltbot.json.template

# Copy skills
COPY skills/ /root/clawd/skills/

WORKDIR /root/clawd
EXPOSE 18789

CMD ["/usr/local/bin/start-fly.sh"]
```

#### 1.3 Create Simplified Startup Script

```bash
#!/bin/bash
# start-fly.sh - Simplified startup for Fly.io (always-on)

set -e

CONFIG_DIR="/root/.clawdbot"
CONFIG_FILE="$CONFIG_DIR/clawdbot.json"
DATA_DIR="/data"
WORKSPACE_DIR="/root/clawd"

echo "[startup] Starting Automna agent..."

# Restore from volume if exists
if [ -d "$DATA_DIR/clawdbot" ]; then
    echo "[startup] Restoring config from volume..."
    cp -a "$DATA_DIR/clawdbot/." "$CONFIG_DIR/" 2>/dev/null || true
fi

if [ -d "$DATA_DIR/workspace" ]; then
    echo "[startup] Restoring workspace from volume..."
    cp -a "$DATA_DIR/workspace/." "$WORKSPACE_DIR/" 2>/dev/null || true
fi

# Create config from template if needed
if [ ! -f "$CONFIG_FILE" ]; then
    echo "[startup] Creating config from template..."
    cp /root/.clawdbot-templates/moltbot.json.template "$CONFIG_FILE" || \
    echo '{"gateway":{"port":18789,"mode":"local"}}' > "$CONFIG_FILE"
fi

# Update config from environment (inline Node.js)
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
config.gateway = config.gateway || {};
config.gateway.port = 18789;
config.gateway.mode = 'local';
config.gateway.trustedProxies = ['0.0.0.0/0'];
if (process.env.CLAWDBOT_GATEWAY_TOKEN) {
  config.gateway.auth = { token: process.env.CLAWDBOT_GATEWAY_TOKEN };
}
config.gateway.controlUi = config.gateway.controlUi || {};
config.gateway.controlUi.allowInsecureAuth = true;
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
"

# Bootstrap workspace if needed
if [ ! -f "$WORKSPACE_DIR/AGENTS.md" ]; then
    echo "[startup] Bootstrapping workspace..."
    clawdbot setup --workspace "$WORKSPACE_DIR" --non-interactive || {
        mkdir -p "$WORKSPACE_DIR/memory"
        echo "# Agent Instructions" > "$WORKSPACE_DIR/AGENTS.md"
        echo "# About Your User" > "$WORKSPACE_DIR/USER.md"
    }
fi

# Start background sync to volume (every 30s)
(
    while true; do
        rsync -a --delete "$CONFIG_DIR/" "$DATA_DIR/clawdbot/" 2>/dev/null || true
        rsync -a --delete --exclude='.git' --exclude='node_modules' "$WORKSPACE_DIR/" "$DATA_DIR/workspace/" 2>/dev/null || true
        sleep 30
    done
) &

echo "[startup] Starting Clawdbot gateway..."
exec clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan ${CLAWDBOT_GATEWAY_TOKEN:+--token "$CLAWDBOT_GATEWAY_TOKEN"}
```

#### 1.4 Create fly.toml

```toml
# fly.toml
app = "automna-agents"
primary_region = "sjc"  # San Jose (closest to Vegas)

[build]
  dockerfile = "Dockerfile.fly"

[env]
  # Non-secret environment variables

[http_service]
  internal_port = 18789
  force_https = true
  auto_stop_machines = false  # CRITICAL: Keep running!
  auto_start_machines = true
  min_machines_running = 0    # We manage this per-user

[http_service.concurrency]
  type = "connections"
  hard_limit = 100
  soft_limit = 80

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 2048

[mounts]
  source = "automna_data"
  destination = "/data"
```

### Phase 2: API Gateway Layer (Day 2)

The key change: we need a routing layer that maps users to their Fly machines.

#### 2.1 Option A: Fly Proxy with Machine-per-User

Each user gets their own Fly Machine. The Vercel API provisions machines via Fly API.

```typescript
// /api/user/gateway/route.ts (updated)
import { auth } from "@clerk/nextjs/server";

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const FLY_APP_NAME = "automna-agents";

// Machine ID is stored in database, keyed by Clerk userId
async function getUserMachineId(userId: string): Promise<string | null> {
  // Query your database for machine_id
  // Return null if user doesn't have a machine yet
}

async function createUserMachine(userId: string): Promise<string> {
  const response = await fetch(`https://api.machines.dev/v1/apps/${FLY_APP_NAME}/machines`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FLY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `user-${userId.replace('user_', '')}`,
      region: 'sjc',
      config: {
        image: 'registry.fly.io/automna-agents:latest',
        env: {
          MOLTBOT_USER_ID: userId,
          CLAWDBOT_GATEWAY_TOKEN: process.env.MOLTBOT_GATEWAY_TOKEN,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
        services: [{
          ports: [{ port: 443, handlers: ['tls', 'http'] }],
          protocol: 'tcp',
          internal_port: 18789,
        }],
        mounts: [{
          volume: await getOrCreateVolume(userId),
          path: '/data',
        }],
      },
    }),
  });
  
  const machine = await response.json();
  // Store machine.id in database
  return machine.id;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  
  let machineId = await getUserMachineId(userId);
  if (!machineId) {
    machineId = await createUserMachine(userId);
  }
  
  // Generate signed URL pointing to user's machine
  const gatewayUrl = generateSignedUrl(userId, machineId);
  
  return Response.json({ gatewayUrl, sessionKey: 'main' });
}
```

#### 2.2 Option B: Fly Proxy App (Simpler)

Create a lightweight proxy app that routes requests based on userId.

```typescript
// fly-proxy/src/index.ts
import { Hono } from 'hono';

const app = new Hono();

// Route based on userId in query param
app.all('*', async (c) => {
  const userId = c.req.query('userId');
  if (!userId) return c.json({ error: 'Missing userId' }, 400);
  
  // Get machine hostname for this user
  const machineHost = await getMachineForUser(userId);
  
  // Proxy request to user's machine
  const url = new URL(c.req.url);
  url.hostname = machineHost;
  
  return fetch(url.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });
});

export default app;
```

### Phase 3: Frontend Updates (Day 2-3)

#### 3.1 Update `/api/user/gateway`

- Change `MOLTWORKER_WS_URL` to Fly endpoint
- Add machine provisioning logic
- Keep signed URL auth (works the same)

#### 3.2 No Changes Needed

- `ClawdbotRuntime` — WebSocket connects same way
- `FileProvider` — HTTP calls work same way
- `AutomnaChat` — No changes

### Phase 4: Data Migration (Day 3)

#### 4.1 Export from R2

```bash
# For each user, export their data
aws s3 sync s3://moltbot-data/users/ ./export/ \
  --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com
```

#### 4.2 Import to Fly Volumes

For each user's machine:
```bash
fly ssh console -a automna-agents -s user-xxx
# Inside machine:
# Copy data from export to /data/
```

Or: On first boot, the machine detects empty volume and runs migration from R2 (one-time).

### Phase 5: Testing & Cutover (Day 4-5)

#### 5.1 Testing Checklist

- [ ] User signup → Machine created
- [ ] Dashboard loads → WebSocket connects
- [ ] Chat works → Messages sent/received
- [ ] History loads → Previous messages shown
- [ ] Files tab → Directory listing works
- [ ] File read/write → Content saved
- [ ] Session persistence → Data survives machine restart
- [ ] Cold start (if machine stopped) → Restarts automatically
- [ ] Multiple users → Isolated properly

#### 5.2 Cutover Steps

1. Deploy Fly app (machines start empty)
2. Update Vercel env vars (`MOLTWORKER_*` → Fly URLs)
3. Deploy Vercel frontend
4. Test with test account
5. Enable for all users (new users get Fly machines)
6. Migrate existing users' data from R2 to Fly volumes
7. Monitor for issues
8. Decommission Cloudflare Sandbox

---

## Risk Assessment

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Data loss during migration** | Critical | Export R2 backup first, test with test user |
| **WebSocket proxy issues** | High | Test thoroughly, keep CF as fallback |
| **Machine provisioning fails** | High | Queue system, retry logic, alerts |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Cost higher than expected** | Medium | Monitor early, optimize machine sizes |
| **Fly API rate limits** | Medium | Queue machine creation, batch operations |
| **Volume I/O slower than R2** | Medium | Benchmark, consider Redis for hot data |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Signed URL auth breaks** | Low | Same logic, just different URLs |
| **Frontend changes needed** | Low | Minimal changes (just URLs) |

---

## Rollback Plan

If migration fails:

1. Revert Vercel env vars to Cloudflare URLs
2. Redeploy Vercel frontend
3. Cloudflare Sandbox still works (data in R2)
4. Debug Fly issues offline
5. Retry migration when fixed

---

## Cost Comparison

### Current (Cloudflare)
- Per user (if always-on): ~$26/month
- Per user (with hibernation): ~$5-10/month
- Problem: Hibernation breaks "always-on" value prop

### Fly.io (Projected)
- Per user (always-on): ~$7-9/month
  - shared-cpu-1x, 2GB RAM: ~$9/month
  - shared-cpu-1x, 1GB RAM: ~$5/month
- Volume storage: ~$0.15/GB/month (~$0.50/user)
- **Total: ~$7-10/user/month**

### Hetzner (Future Optimization)
- Per user: ~$4-5/month
- Consider after MVP is stable

---

## Timeline

| Day | Tasks |
|-----|-------|
| **Day 1** | Setup Fly account, adapt Dockerfile, create fly.toml, test basic deploy |
| **Day 2** | Build machine provisioning API, update `/api/user/gateway`, test WebSocket |
| **Day 3** | Test file APIs, data persistence, multi-user isolation |
| **Day 4** | Data migration scripts, test with real data, integration testing |
| **Day 5** | Cutover, monitoring, bug fixes |

---

## Open Questions

1. **Database for machine tracking?** — Currently no DB. Need to add one (Turso, PlanetScale, or Fly Postgres)?

2. **Machine naming convention?** — `user-{clerkId}` or UUID?

3. **Volume per user or shared?** — Per-user volume is simpler, but more overhead.

4. **Keep R2 or migrate to S3?** — R2 is fine, can access from Fly via S3 API.

5. **Proxy layer or direct connection?** — Direct is simpler, proxy allows caching.

---

## Next Steps

1. [ ] Alex: Review and approve plan
2. [ ] Create Fly.io account
3. [ ] Test basic Dockerfile on Fly
4. [ ] Decide on database for machine tracking
5. [ ] Start Phase 1 implementation
