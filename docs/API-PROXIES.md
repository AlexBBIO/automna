# API Proxies

All external API calls from user machines route through the Automna proxy.

**Why:**
- Usage tracking per user (tokens, API calls, cost)
- Rate limiting per plan
- Security — users never see real API keys
- Billing visibility across all services

## Architecture

**Proxy runs on Fly.io** as a dedicated always-on app (`automna-proxy`). This replaces the previous Vercel Edge Function approach which caused 504 timeouts under concurrent streaming load.

```
User Machine (Fly, sjc)       automna-proxy (Fly, sjc)     External APIs
    |                              |                            |
    | gateway token in header      |                            |
    |----------------------------->|                            |
    |                   1. Validate token (Turso)               |
    |                   2. Check rate limits                     |
    |                   3. Swap token for real API key           |
    |                              |--- real key --------------->|
    |                              |<--- response/stream --------|
    |                   4. Extract usage from response           |
    |                   5. Log to usage_events (Turso)           |
    |<----- stream/response -------|                            |
```

**Key advantage:** User machines and proxy are both in **sjc** on Fly — same-region, minimal latency, no cold starts, no function concurrency limits.

---

## Proxy App Details

| Property | Value |
|----------|-------|
| **App name** | `automna-proxy` |
| **URL** | `https://automna-proxy.fly.dev` |
| **Runtime** | Bun (oven/bun:1) |
| **Framework** | Hono |
| **Region** | sjc |
| **Machines** | 2 (HA, shared-cpu-1x, 512MB) |
| **Source** | `/projects/automna/fly-proxy/` |
| **Database** | Turso (shared with landing app) |
| **Cost** | ~$3-5/month |

---

## Proxied Services

| Service | Proxy Path | Upstream | Status |
|---------|-----------|----------|--------|
| Anthropic LLM | `/api/llm/v1/messages` | `api.anthropic.com` | ✅ Production |
| Gemini | `/api/gemini/*` | `generativelanguage.googleapis.com` | ✅ Production |
| Browserbase | `/api/browserbase/v1/*` | `api.browserbase.com` | ✅ Production |
| Brave Search | `/api/brave/*` | `api.search.brave.com` | ✅ Production |
| Email (send) | `/api/user/email/send` | `api.agentmail.to` | ✅ Production |
| Email (inbox) | `/api/user/email/inbox` | `api.agentmail.to` | ✅ Production |
| Email (message) | `/api/user/email/inbox/:id` | `api.agentmail.to` | ✅ Production |

### Not on Fly Proxy (stays on Vercel)

- **Voice call initiate** (`POST /api/user/call`) — stays on Vercel for Clerk auth support
- **Voice call status** (`GET /api/user/call/status`) — stays on Vercel
- **Voice call usage** (`GET /api/user/call/usage`) — stays on Vercel
- **Bland webhook** (`POST /api/webhooks/bland/status`) — needs stable public URL
- **All dashboard/admin routes** — Clerk auth, user management, provisioning
- **File API** (`/api/files/*`) — file uploads/downloads
- **WebSocket proxy** (`/api/ws/*`)

---

## Machine Configuration

### How Proxy URL Gets Set

The Docker entrypoint (`docker/entrypoint.sh`) reads the `AUTOMNA_PROXY_URL` env var and writes it into the OpenClaw config on every boot:

```bash
# In entrypoint.sh:
AUTOMNA_PROXY_URL="${AUTOMNA_PROXY_URL:-https://automna.ai}"  # defaults to Vercel fallback
# Writes clawdbot.json with:
#   models.providers.automna.baseUrl = "$AUTOMNA_PROXY_URL/api/llm"
# Also sets:
#   ANTHROPIC_BASE_URL="$AUTOMNA_PROXY_URL/api/llm"
```

### Machine Environment Variables

```bash
# Proxy URL (controls where entrypoint points the config)
AUTOMNA_PROXY_URL=https://automna-proxy.fly.dev

# Auth
OPENCLAW_GATEWAY_TOKEN=<uuid>

# Anthropic (gateway token, NOT real key)
ANTHROPIC_API_KEY=<gateway-token>

# Gemini
GEMINI_API_KEY=<gateway-token>
GOOGLE_API_BASE_URL=https://automna-proxy.fly.dev/api/gemini

# Browserbase
BROWSERBASE_API_KEY=<gateway-token>
BROWSERBASE_API_URL=https://automna-proxy.fly.dev/api/browserbase
BROWSERBASE_PROJECT_ID=<project-id>
BROWSERBASE_CONTEXT_ID=<user-context-id>

# Brave Search
BRAVE_API_KEY=<gateway-token>
BRAVE_API_URL=https://automna-proxy.fly.dev/api/brave

# Email (no API key, uses gateway token)
AGENTMAIL_INBOX_ID=<user-inbox>
```

**Key insight:** The gateway token serves as the "API key" for all services. The proxy validates it against Turso, then forwards requests with real keys.

### Updating a Machine to Use the Fly Proxy

```bash
export FLY_API_TOKEN=$(jq -r .token config/fly.json)

# 1. Get current machine config
MACHINE_ID="<machine-id>"
APP="automna-u-<shortid>"
FULL=$(curl -s -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/$APP/machines/$MACHINE_ID")

# 2. Update env vars (Python one-liner)
echo "$FULL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
env = d['config']['env']
env['AUTOMNA_PROXY_URL'] = 'https://automna-proxy.fly.dev'
env['BRAVE_API_URL'] = 'https://automna-proxy.fly.dev/api/brave'
env['BROWSERBASE_API_URL'] = 'https://automna-proxy.fly.dev/api/browserbase'
env['GOOGLE_API_BASE_URL'] = 'https://automna-proxy.fly.dev/api/gemini'
json.dump({'config': d['config']}, open('/tmp/update.json', 'w'))
"

# 3. Apply update
curl -s -X POST -H "Authorization: Bearer $FLY_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.machines.dev/v1/apps/$APP/machines/$MACHINE_ID" \
  -d @/tmp/update.json

# 4. Restart (or start if stopped)
fly machines restart $MACHINE_ID -a $APP
```

**⚠️ IMPORTANT:** The entrypoint regenerates `clawdbot.json` on every boot. SSH-editing the config file directly won't persist — you must set the `AUTOMNA_PROXY_URL` env var on the machine.

---

## Fly Proxy Environment Variables

Real API keys exist **only** on the Fly proxy app:

```bash
# Real API keys
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
BROWSERBASE_API_KEY=bb_...
BRAVE_API_KEY=BSA...
AGENTMAIL_API_KEY=am_...

# Database
TURSO_URL=libsql://automna-alexbbio.aws-us-west-2.turso.io
TURSO_TOKEN=...
```

Set via: `fly secrets set -a automna-proxy KEY=VALUE`

---

## Route Details

### Anthropic LLM Proxy

**Path:** `POST /api/llm/v1/messages`
**File:** `fly-proxy/src/routes/anthropic.ts`

Features:
- Streaming SSE passthrough with keepalive comments (25s interval)
- Token extraction from stream events (`message_start` for input/cache, `message_delta` for output)
- Non-streaming mode supported
- 5-minute timeout
- Per-request trace IDs for debugging
- Forwards `anthropic-version` and `anthropic-beta` headers

### Gemini Proxy

**Path:** `/api/gemini/*` (catch-all)
**File:** `fly-proxy/src/routes/gemini.ts`

Features:
- Swaps user's `?key=` param for real API key
- All HTTP methods supported
- 2-minute timeout

### Browserbase Proxy

**Path:** `/api/browserbase/v1/*` (catch-all)
**File:** `fly-proxy/src/routes/browserbase.ts`

Features:
- Tracks session creation for billing
- All HTTP methods supported
- 1-minute timeout

### Brave Search Proxy

**Path:** `/api/brave/*` (catch-all)
**File:** `fly-proxy/src/routes/brave.ts`

Features:
- Query param passthrough
- Per-query cost tracking
- 30-second timeout

### Email Proxy

**Path:** `/api/user/email/*`
**File:** `fly-proxy/src/routes/email.ts`

Endpoints:
- `POST /api/user/email/send` — Send email (50/day rate limit)
- `GET /api/user/email/inbox` — List inbox messages
- `GET /api/user/email/inbox/:messageId` — Get message detail

Features:
- Attachment support: `{filename, content_type, content (base64)}` or `{filename, url}`
- Daily send rate limit tracked in `email_sends` table
- Per-send cost tracking

---

## Usage Tracking

### Table: `usage_events` (unified billing)

All billable activity logs here. This is the source of truth for Automna Token usage.

| Field | Description |
|-------|-------------|
| userId | Clerk user ID |
| eventType | `llm`, `search`, `browser`, `call`, `email` |
| automnaTokens | `ceil(costMicrodollars / 100)` |
| costMicrodollars | From pricing calculation or fixed costs |
| metadata | JSON with model, token counts, etc. |

### Table: `llm_usage` (detailed LLM log)

Per-request token-level detail for Anthropic calls.

| Field | Description |
|-------|-------------|
| userId, provider, model | Request identity |
| inputTokens, outputTokens | Token counts |
| cacheCreationTokens, cacheReadTokens | Prompt caching |
| costMicrodollars | Calculated cost |
| durationMs | Request duration |
| error | Error message if failed |

### Fixed Costs (non-LLM)

| Service | Cost per action | Automna Tokens |
|---------|----------------|----------------|
| Brave Search | $0.003/query | 30 AT |
| Browserbase | $0.02/session | 200 AT |
| Email send | $0.002/send | 20 AT |
| Voice call | $0.09/minute | 900 AT/min |
| Failed call | $0.015/attempt | 150 AT |

---

## Rate Limiting

| Limit | Free | Starter | Pro | Business |
|-------|------|---------|-----|----------|
| Monthly AT | 10K | 200K | 1M | 5M |
| Requests/min | 5 | 20 | 60 | 120 |
| Call minutes | 0 | 0 | 60 | 300 |

Rate limit responses use Anthropic-compatible error format with `Retry-After` header.

---

## Auth Flow

1. User machine sends request with gateway token in `x-api-key` or `Authorization: Bearer` header
2. Proxy looks up token in `machines` table (Turso) — 5-minute in-memory cache
3. Returns `{userId, appName, machineId, plan}` or 401
4. Rate limits checked against plan
5. Request forwarded to upstream with real API key
6. Usage logged to Turso (fire-and-forget)

---

## Deploying Updates

```bash
cd /root/clawd/projects/automna/fly-proxy
export FLY_API_TOKEN=$(jq -r .token ../config/fly.json)
export PATH="$PATH:/root/.fly/bin"
fly deploy --remote-only
```

Type-check before deploy:
```bash
npx tsc --noEmit
```

---

## Troubleshooting

### Requests not going through proxy

**Symptom:** Fly proxy logs show only health checks, no API calls

**Causes:**
1. Machine missing `AUTOMNA_PROXY_URL` env var (entrypoint defaults to `automna.ai`)
2. Machine hasn't been restarted after env var update

**Fix:**
```bash
# Verify the config on the machine
fly ssh console -a automna-u-<id> -C "cat /home/node/.openclaw/clawdbot.json" | grep baseUrl
# Should show: https://automna-proxy.fly.dev/api/llm

# Check env vars
fly ssh console -a automna-u-<id> -C "env" | grep PROXY
# Should show: AUTOMNA_PROXY_URL=https://automna-proxy.fly.dev
```

### 401 from proxy

**Cause:** Invalid or expired gateway token

**Fix:**
```bash
# Check token in Turso
turso db shell automna "SELECT gateway_token FROM machines WHERE app_name='automna-u-<id>'"
# Compare with what the machine is sending
```

### Image model 401

**Symptom:** `image failed: 401 invalid x-api-key`

**Cause:** OpenClaw's image tool uses `ANTHROPIC_API_KEY` env var directly against the default Anthropic endpoint, bypassing the custom provider config.

**Status:** Known issue. The `ANTHROPIC_BASE_URL` env var is set by the entrypoint, which should route image calls through the proxy. If the image tool ignores this, it's an OpenClaw bug.
