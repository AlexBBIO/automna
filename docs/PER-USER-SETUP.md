# Per-User Instance Setup

**Last Updated:** 2026-02-02 17:00 UTC  
**Status:** Production (MVP)

This document covers everything needed to provision, configure, and troubleshoot per-user OpenClaw instances on Fly.io.

---

## Overview

Each Automna user gets an isolated OpenClaw (Clawdbot) instance:

```
User signs up → Dashboard visit → Provision API → Fly app created → User connects
```

| Component | Per-User Value |
|-----------|---------------|
| Fly App | `automna-u-{shortId}` (e.g., `automna-u-7def456`) |
| Fly Machine | One per app |
| Volume | 1GB encrypted, mounted at `/home/node/.openclaw` |
| Gateway URL | `wss://automna-u-{shortId}.fly.dev/ws` |
| Gateway Token | Random UUID, stored in Turso |

---

## Docker Image (Custom Automna Build)

We use a **custom Docker image** that extends the community OpenClaw image with a session key fixer.

| Component | Value |
|-----------|-------|
| **Image** | `registry.fly.io/automna-openclaw-image:latest` |
| Base image | `ghcr.io/phioranex/openclaw-docker:latest` |
| Source | `docker/Dockerfile` + `docker/entrypoint.sh` |
| npm package | `openclaw@2026.1.30` (from base) |
| Config directory | `/home/node/.openclaw` (runs as `node` user) |
| Gateway port | 18789 |
| Default model | Claude (via ANTHROPIC_API_KEY) |

### Why Custom Image?

OpenClaw has a bug where sessions are stored with key `main` but looked up with canonical key `agent:main:main`. Our custom image includes a background fixer that:

1. Runs every 3 seconds
2. Detects non-canonical session keys
3. Converts them to canonical form
4. Works for all conversations (main, work, etc.)

### Rebuilding the Image

When the upstream OpenClaw image updates or we need changes:

```bash
cd /root/clawd/projects/automna/docker

# Build locally
docker build -t automna-openclaw:latest .

# Tag for Fly registry
docker tag automna-openclaw:latest registry.fly.io/automna-openclaw-image:latest

# Authenticate with Fly (if needed)
export FLY_API_TOKEN=$(jq -r .token ../config/fly.json)
fly auth docker

# Push to Fly registry
docker push registry.fly.io/automna-openclaw-image:latest
```

**New users** will automatically get the updated image on provisioning.

**Existing users** need their machine updated:
```bash
fly machines update <machine-id> -a automna-u-xxx --image registry.fly.io/automna-openclaw-image:latest --yes
```

---

## Provisioning Flow

### API: `/api/user/provision`

**Location:** `landing/src/app/api/user/provision/route.ts`

**What it does:**

1. **Generate short ID** from Clerk userId
   ```typescript
   // user_2abc123def456 → 3def456 (last 12 chars, lowercase)
   const shortId = userId.replace("user_", "").slice(-12).toLowerCase();
   const appName = `automna-u-${shortId}`;
   ```

2. **Create Fly app** via GraphQL API
   ```graphql
   mutation {
     createApp(input: { name: "automna-u-xxx", organizationId: "..." }) {
       app { id name }
     }
   }
   ```

3. **Allocate IPs** (shared v4 + v6)
   - Required for `appname.fly.dev` DNS resolution

4. **Set secrets** via GraphQL (for future use)
   ```graphql
   mutation {
     setSecrets(input: { appId: "...", secrets: [...] }) {
       app { id }
     }
   }
   ```

5. **Create volume** (1GB, encrypted)
   ```
   POST /v1/apps/{appName}/volumes
   { "name": "openclaw_data", "region": "sjc", "size_gb": 1, "encrypted": true }
   ```

6. **Create machine** with full config
   ```json
   {
     "image": "ghcr.io/phioranex/openclaw-docker:latest",
     "guest": { "cpu_kind": "shared", "cpus": 1, "memory_mb": 2048 },
     "init": {
       "cmd": ["gateway", "--allow-unconfigured", "--bind", "lan", "--auth", "token", "--token", "<gatewayToken>"]
     },
     "services": [{
       "ports": [{ "port": 443, "handlers": ["tls", "http"] }],
       "internal_port": 18789
     }],
     "env": {
       "ANTHROPIC_API_KEY": "...",
       "OPENCLAW_GATEWAY_TOKEN": "<gatewayToken>"
     },
     "mounts": [{
       "volume": "<volumeId>",
       "path": "/home/node/.openclaw"
     }]
   }
   ```

7. **Wait for machine** (polls until `state === "started"`)

8. **Store in Turso**
   - `machines` table: id, userId, appName, region, volumeId, status, gatewayToken

### Critical Configuration Details

**⚠️ These are mandatory for the gateway to work:**

| Config | Value | Why |
|--------|-------|-----|
| `init.cmd` | `["gateway", "--allow-unconfigured", "--bind", "lan", "--auth", "token", "--token", "<token>"]` | Image doesn't auto-start; must pass all flags |
| `--bind lan` | Required | Without this, only binds to loopback (127.0.0.1) |
| `--auth token` | Required | Simple token auth (not challenge-response) |
| `--allow-unconfigured` | Required | Starts without config file |
| Mount path | `/home/node/.openclaw` | phioranex image runs as `node` user |

**❌ Common mistakes:**
- Using `/root/.openclaw` (wrong user - image runs as `node`)
- Forgetting `--bind lan` (gateway unreachable from outside)
- Using `fly secrets set` (doesn't work with Machines API - must pass in `config.env`)
- Forgetting `--auth token` (defaults to challenge-response which requires more setup)

---

## Session Key Issue (✅ FIXED)

### The Bug

OpenClaw has a session key mismatch bug that affects chat history:

| Where | Key Used |
|-------|----------|
| **WebSocket creates session** | `main`, `work`, etc. |
| **`chat.history` lookup** | `agent:main:main`, `agent:main:work` (canonical form) |

**Result:** History lookup fails because the store has `{"main": {...}}` but code looks for `store["agent:main:main"]`.

### ✅ Production Fix: Background Session Key Fixer

**Fixed via:** Custom Docker image with background fixer (`docker/entrypoint.sh`)

The fix runs as a background process in the container:

1. **Monitors sessions.json** every 3 seconds
2. **Detects non-canonical keys** (keys without `agent:main:` prefix that have session data)
3. **Converts to canonical form** using Node.js for reliable JSON manipulation
4. **Works for all conversations** — main, work, research, etc.

**The entrypoint script:**
```bash
# Background fixer loop (runs every 3 seconds)
run_fixer() {
    while true; do
        sleep 3
        # Node.js script that:
        # - Reads sessions.json
        # - Finds keys like "main", "work" with sessionId data
        # - Renames to "agent:main:main", "agent:main:work"
        # - Writes back if changed
        fix_session_keys
    done
}

# Start fixer in background, then start gateway
run_fixer &
exec node /app/dist/index.js "$@"
```

**Result:** Sessions are automatically fixed within 3 seconds of creation. History loading works correctly.

### Manual Fix (If Needed)

If you need to manually fix sessions:

```bash
# SSH into the machine
export FLY_API_TOKEN=$(jq -r .token config/fly.json)
fly ssh console -a automna-u-xxx

# Check current sessions
cat /home/node/.openclaw/agents/main/sessions/sessions.json

# The background fixer should auto-fix, but if not:
# Use Node.js to fix (from outside container):
fly ssh console -a automna-u-xxx -C 'node -e "
const fs = require(\"fs\");
const file = \"/home/node/.openclaw/agents/main/sessions/sessions.json\";
const data = JSON.parse(fs.readFileSync(file));
const fixed = {};
for (const [k, v] of Object.entries(data)) {
  const key = k.startsWith(\"agent:main:\") ? k : \"agent:main:\" + k;
  if (v.sessionId) fixed[key] = v;
}
fs.writeFileSync(file, JSON.stringify(fixed, null, 2));
console.log(\"Fixed\");
"'
```

### Upstream Bug Report (TODO)

Should still report to OpenClaw:
- **Issue:** Session creation should use canonical key from the start
- **Repo:** https://github.com/phioranex/openclaw
- **Workaround:** Our custom Docker image with background fixer

### Session File Structure

```
/home/node/.openclaw/
└── agents/
    └── main/
        └── sessions/
            ├── sessions.json          # Session metadata
            └── agent:main:main/       # Session directory (canonical name)
                └── history.jsonl      # Chat history
```

**sessions.json format:**
```json
{
  "agent:main:main": {
    "created": "2026-02-02T...",
    "lastActive": "2026-02-02T...",
    "messageCount": 5
  }
}
```

---

## Database Schema

### Turso Tables

```sql
-- machines table
CREATE TABLE machines (
  id TEXT PRIMARY KEY,           -- Fly machine ID
  user_id TEXT NOT NULL UNIQUE,  -- Clerk user ID
  app_name TEXT NOT NULL,        -- Fly app name (automna-u-xxx)
  region TEXT NOT NULL,          -- sjc, etc.
  volume_id TEXT,                -- Fly volume ID
  status TEXT DEFAULT 'created', -- created, started, stopped, destroyed
  ip_address TEXT,               -- Private IP
  gateway_token TEXT,            -- Auth token for WebSocket
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  last_active_at INTEGER
);

-- machine_events table (audit log)
CREATE TABLE machine_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id TEXT NOT NULL,
  event_type TEXT NOT NULL,      -- created, started, stopped, destroyed, error
  details TEXT,                  -- JSON blob
  created_at INTEGER DEFAULT (unixepoch())
);
```

### Drizzle Schema

**Location:** `landing/src/lib/db/schema.ts`

---

## Connecting to a User Instance

### From Dashboard (Normal Flow)

1. Dashboard calls `/api/user/gateway`
2. Gateway endpoint:
   - Looks up machine in Turso
   - Returns `gatewayUrl` and `gatewayToken`
3. Frontend connects via WebSocket

### For Debugging

```bash
# List user apps
export FLY_API_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/fly.json)
/root/.fly/bin/fly apps list | grep automna-u

# Get app info
/root/.fly/bin/fly status -a automna-u-xxx

# View logs
/root/.fly/bin/fly logs -a automna-u-xxx --no-tail

# SSH into machine
/root/.fly/bin/fly ssh console -a automna-u-xxx

# Inside machine - check OpenClaw
ls -la /home/node/.openclaw/
cat /home/node/.openclaw/agents/main/sessions/sessions.json
```

---

## Gateway Startup

### What Happens on Boot

1. Container starts with `init.cmd`
2. Gateway binds to 0.0.0.0:18789
3. First request creates session
4. Anthropic API used for Claude responses

### Startup Time

| Phase | Duration |
|-------|----------|
| Machine boot | ~10-20s |
| Gateway ready | ~5-10s |
| **Total cold start** | **~30-60s** |

The dashboard shows "Starting your agent..." during this time.

### Health Check

**Endpoint:** `/api/user/health`

Polls the gateway until it responds to verify it's ready:

```typescript
// Tries: GET https://automna-u-xxx.fly.dev/ (control UI)
// Success: 200 with HTML containing "Clawdbot" or "OpenClaw"
// Timeout: 60 seconds
```

---

## Troubleshooting

### Gateway Unreachable

**Symptoms:** WebSocket connection fails, health check times out

**Checks:**
1. Is machine running? `fly status -a automna-u-xxx`
2. Are IPs allocated? `fly ips list -a automna-u-xxx`
3. Is gateway listening? SSH in and `curl localhost:18789`
4. Check logs: `fly logs -a automna-u-xxx`

**Common causes:**
- Missing `--bind lan` in init.cmd
- Machine stopped (auto-stop disabled but can happen)
- Volume mount path wrong

### History Not Loading

**Symptoms:** Chat works but previous messages don't appear

**Checks:**
1. SSH into machine
2. Check session files exist:
   ```bash
   ls -la /home/node/.openclaw/agents/main/sessions/
   cat /home/node/.openclaw/agents/main/sessions/sessions.json
   ```
3. Check session key matches (see Session Key Issue above)

**Fix:** Rename session key in sessions.json from `main` to `agent:main:main`

### Token Mismatch

**Symptoms:** 401 Unauthorized on WebSocket connect

**Checks:**
1. Token in Turso matches what was passed to machine
2. `/api/user/gateway` returns correct token
3. `/api/ws/*` proxy uses token from Turso (not env var)

**Fix:** The token is generated at provision time and stored in Turso. The `/api/ws/*` proxy must fetch it from DB, not use a shared secret.

### Machine Deleted Externally

**Symptoms:** Provision fails or machine not found

**Checks:**
1. `fly status -a automna-u-xxx` returns error
2. Turso still has machine record

**Fix:** Delete Turso record, let provision recreate:
```sql
DELETE FROM machines WHERE user_id = 'user_xxx';
```

---

## Cost Per User

| Component | Monthly Cost |
|-----------|-------------|
| Fly Machine (shared-cpu-1x, 2GB) | ~$9 |
| Fly Volume (1GB) | ~$0.15 |
| **Total** | **~$9.15/user** |

---

## Checklist for New Deployments

When provisioning is triggered:

- [ ] App created with correct name (`automna-u-{shortId}`)
- [ ] IPs allocated (both v4 and v6)
- [ ] Volume created (1GB, encrypted, in same region)
- [ ] Machine created with correct config:
  - [ ] Image: `ghcr.io/phioranex/openclaw-docker:latest`
  - [ ] init.cmd: `["gateway", "--allow-unconfigured", "--bind", "lan", "--auth", "token", "--token", "..."]`
  - [ ] Mount path: `/home/node/.openclaw`
  - [ ] Env vars: ANTHROPIC_API_KEY, OPENCLAW_GATEWAY_TOKEN
- [ ] Machine reaches "started" state
- [ ] Record stored in Turso (machines table)
- [ ] Event logged (machine_events table)
- [ ] Gateway responds to health check

---

## References

- **Provisioning code:** `landing/src/app/api/user/provision/route.ts`
- **Gateway endpoint:** `landing/src/app/api/user/gateway/route.ts`
- **WS proxy:** `landing/src/app/api/ws/[...path]/route.ts`
- **Health check:** `landing/src/app/api/user/health/route.ts`
- **Fly API docs:** https://fly.io/docs/machines/api/
- **OpenClaw image:** https://github.com/phioranex/openclaw-docker
