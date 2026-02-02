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

## Decisions & Robust Architecture

### Decision 1: Fly API Capabilities ✅

**Yes, Fly API can control everything we need:**

| Operation | API Endpoint | Notes |
|-----------|--------------|-------|
| Create Machine | `POST /v1/apps/{app}/machines` | Full config: image, env, services, mounts |
| Delete Machine | `DELETE /v1/apps/{app}/machines/{id}` | Clean removal |
| Start/Stop | `POST /v1/apps/{app}/machines/{id}/start` | Lifecycle control |
| List Machines | `GET /v1/apps/{app}/machines` | Query all machines |
| Get Machine | `GET /v1/apps/{app}/machines/{id}` | Status, config |
| Create Volume | `POST /v1/apps/{app}/volumes` | Persistent storage |
| Delete Volume | `DELETE /v1/apps/{app}/volumes/{id}` | Cleanup |
| Attach Volume | Part of machine config | `mounts` in config |

**API is REST-based, well-documented, and stable.** No vendor lock-in concerns — it's straightforward HTTP/JSON.

---

### Decision 2: Database — Turso ✅

**Choice: Turso (serverless SQLite at the edge)**

**Why Turso:**
- **Free tier:** 500M reads, 10M writes, 5GB storage, 100 databases
- **Developer plan:** $5/month if we exceed free tier
- **Edge replication:** Low latency from Vercel functions
- **SQLite:** Simple, no ORM needed, familiar
- **Drizzle ORM:** Works great with Turso, type-safe

**Schema:**

```sql
-- Users table (synced from Clerk webhooks)
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- Clerk user ID (user_xxx)
  email TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Machines table (Fly machine tracking)
CREATE TABLE machines (
  id TEXT PRIMARY KEY,           -- Fly machine ID
  user_id TEXT NOT NULL UNIQUE,  -- One machine per user
  region TEXT NOT NULL,          -- e.g., 'sjc'
  volume_id TEXT,                -- Attached volume ID
  status TEXT DEFAULT 'created', -- created, started, stopped, destroyed
  ip_address TEXT,               -- Private IP for direct connection
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  last_active_at INTEGER,        -- For billing/cleanup
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Machine events (audit log)
CREATE TABLE machine_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id TEXT NOT NULL,
  event_type TEXT NOT NULL,      -- created, started, stopped, destroyed, error
  details TEXT,                  -- JSON blob
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (machine_id) REFERENCES machines(id)
);
```

**Why not alternatives:**
- **PlanetScale:** More expensive, MySQL (overkill for our use)
- **Fly Postgres:** Requires managing a Fly app, more ops
- **Supabase:** Great but heavier than we need
- **Clerk metadata:** Can't query, no relationships

---

### Decision 3: Volume Strategy ✅

**Choice: One dedicated volume per user**

**Architecture:**
```
User A Machine ←→ Volume A (/data, 1GB)
User B Machine ←→ Volume B (/data, 1GB)
User C Machine ←→ Volume C (/data, 1GB)
```

**Why per-user volumes:**
1. **Isolation:** No risk of cross-user data access
2. **Simplicity:** No replication logic needed
3. **Scalability:** Each user's data grows independently
4. **Cleanup:** Delete user → delete volume (clean)

**Volume contents:**
```
/data/
├── clawdbot/           # Clawdbot config
│   ├── clawdbot.json
│   └── agents/
├── workspace/          # User's workspace files
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── USER.md
│   └── memory/
└── .last-sync          # Timestamp for debugging
```

**Volume sizing:**
- **Initial:** 1GB per user ($0.15/month)
- **Growth:** Can extend via API if needed
- **Snapshots:** Fly takes daily snapshots (retained 5 days free)

**Cost:** ~$0.15-0.30/user/month for storage

---

### Decision 4: Storage Strategy — Keep R2 + Volumes ✅

**Hybrid approach for robustness:**

| Data Type | Primary Storage | Backup/Secondary |
|-----------|-----------------|------------------|
| Workspace files | Fly Volume | R2 (nightly backup) |
| Chat history | Fly Volume | R2 (real-time sync) |
| Config | Fly Volume | R2 (on change) |
| File cache | Local (in-memory) | None needed |

**Why hybrid:**
1. **Fly Volume:** Fast, local to machine, always available
2. **R2 Backup:** Disaster recovery, cross-region redundancy
3. **No single point of failure:** Volume dies → restore from R2

**Sync strategy:**
```
┌─────────────────────────────────────────────────────────────┐
│                    User's Fly Machine                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   /data (Volume)                     │    │
│  │   Primary storage — all reads/writes go here        │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          │                                   │
│              Background sync (every 5 min)                   │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              R2 Bucket (via S3 API)                  │    │
│  │   /users/{userId}/backup/                            │    │
│  │   Secondary — disaster recovery only                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**R2 access from Fly:**
- Use S3 API (R2 is S3-compatible)
- No special SDK needed, just `aws-sdk` or `@aws-sdk/client-s3`
- Credentials: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

---

### Production-Ready Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
┌───────────────────────────────┐  ┌───────────────────────────────────────────┐
│         Vercel                │  │                 Fly.io                     │
│                               │  │                                           │
│  ┌─────────────────────────┐  │  │  ┌─────────────────────────────────────┐  │
│  │   Next.js Dashboard     │  │  │  │          Fly Proxy (Edge)           │  │
│  │                         │  │  │  │   Routes *.automna-agents.fly.dev   │  │
│  │  - Landing page         │  │  │  │   to correct machine by hostname    │  │
│  │  - Auth (Clerk)         │  │  │  └─────────────────┬───────────────────┘  │
│  │  - Dashboard UI         │  │  │                    │                      │
│  │  - Billing (Stripe)     │  │  │    ┌───────────────┼───────────────┐      │
│  └─────────────────────────┘  │  │    │               │               │      │
│                               │  │    ▼               ▼               ▼      │
│  ┌─────────────────────────┐  │  │  ┌─────┐       ┌─────┐       ┌─────┐     │
│  │   API Routes            │  │  │  │ M-A │       │ M-B │       │ M-C │     │
│  │                         │──┼──┼─▶│     │       │     │       │     │     │
│  │  /api/user/gateway      │  │  │  │Clawd│       │Clawd│       │Clawd│     │
│  │  /api/user/provision    │  │  │  │ bot │       │ bot │       │ bot │     │
│  │  /api/webhooks/clerk    │  │  │  │     │       │     │       │     │     │
│  │  /api/webhooks/stripe   │  │  │  │ V-A │       │ V-B │       │ V-C │     │
│  └───────────┬─────────────┘  │  │  └──┬──┘       └──┬──┘       └──┬──┘     │
│              │                │  │     │             │             │         │
└──────────────┼────────────────┘  └─────┼─────────────┼─────────────┼─────────┘
               │                         │             │             │
               ▼                         └──────┬──────┴──────┬──────┘
┌───────────────────────────────┐               │             │
│         Turso                 │               │             │
│                               │               ▼             ▼
│  - users table                │       ┌───────────────────────────┐
│  - machines table             │       │     Cloudflare R2         │
│  - machine_events             │       │                           │
│                               │       │  /users/{userId}/backup/  │
│  Edge-replicated SQLite       │       │  Nightly backups from     │
└───────────────────────────────┘       │  each machine's volume    │
                                        └───────────────────────────┘
```

---

### API Flow (Production)

#### User Signs Up
```
1. User signs up via Clerk
2. Clerk webhook → /api/webhooks/clerk
3. Insert into Turso: users table
4. (Machine NOT created yet — lazy provisioning)
```

#### User Opens Dashboard
```
1. Dashboard calls /api/user/gateway
2. Check Turso: does user have a machine?
   
   IF NO MACHINE:
   3a. Call Fly API: create volume
   3b. Call Fly API: create machine (with volume attached)
   3c. Wait for machine to start (~10-30s first time)
   3d. Insert into Turso: machines table
   3e. Return gateway URL
   
   IF MACHINE EXISTS:
   3a. Check machine status
   3b. If stopped → start it
   3c. Return gateway URL
   
4. Frontend connects via WebSocket
5. User chats with agent
```

#### User Closes Tab
```
1. WebSocket disconnects
2. Machine keeps running (always-on!)
3. Background sync continues to R2
```

#### User Churns / Deletes Account
```
1. Clerk webhook → /api/webhooks/clerk (user.deleted)
2. Call Fly API: stop machine
3. Call Fly API: delete machine
4. Call Fly API: delete volume
5. Optionally: keep R2 backup for 30 days
6. Update Turso: mark as deleted
```

---

### Failure Modes & Recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| **Machine crashes** | Fly auto-restarts | Volume persists, data safe |
| **Volume corrupts** | Startup fails | Restore from R2 backup |
| **R2 unavailable** | Sync fails | Volume is primary, R2 is backup |
| **Turso unavailable** | API calls fail | Cache machine info, retry |
| **Fly API down** | Provisioning fails | Queue request, retry with backoff |

---

### Cost Breakdown (Production)

| Component | Per User/Month | Notes |
|-----------|----------------|-------|
| **Fly Machine** | ~$7-9 | shared-cpu-1x, 2GB RAM |
| **Fly Volume** | ~$0.15 | 1GB storage |
| **R2 Storage** | ~$0.02 | ~100MB/user backup |
| **R2 Operations** | ~$0.01 | Sync operations |
| **Turso** | ~$0.01 | Shared across all users |
| **Vercel** | $0 | Pro plan shared |
| **Total** | **~$7-10** | Per active user |

---

## Revised Next Steps

1. [x] Alex: Review and approve plan
2. [ ] Create Fly.io account (`fly auth login`)
3. [ ] Create Turso database + schema
4. [ ] Set up Drizzle ORM in landing project
5. [ ] Build `/api/user/provision` endpoint
6. [ ] Adapt Dockerfile for Fly
7. [ ] Test basic machine lifecycle
8. [ ] Update `/api/user/gateway` to use Fly
9. [ ] Add R2 backup sync to container
10. [ ] Integration testing
11. [ ] Cutover
