# Fly.io API Proxy — Migration Spec

## Problem

All API proxies currently run as **Vercel Edge Functions** on automna.ai. This creates scaling issues:

- Each LLM streaming request holds a function invocation open for 30-120+ seconds
- Vercel has concurrency limits per deployment — burst traffic causes cascading 504s
- Cold starts add latency
- No connection pooling or request queuing
- As user count grows, even normal usage (concurrent chats) overwhelms the proxy

## Solution

Move all API proxies to a **dedicated always-on Fly.io app** (`automna-proxy`). Node.js handles hundreds of concurrent streaming connections natively without function limits.

---

## Routes to Migrate

### 1. Anthropic LLM (CRITICAL — streaming)
- **Current:** `POST /api/llm/v1/messages`
- **New:** `POST /v1/messages`
- **Auth header:** `x-api-key` (gateway token)
- **Upstream:** `https://api.anthropic.com/v1/messages`
- **Features:** SSE streaming with keepalive, token extraction from stream events (`message_start` for input/cache tokens, `message_delta` for output tokens), usage logging, rate limiting
- **Timeout:** 300s (5 min)
- **This is the primary bottleneck** — long-lived streaming connections are what cause 504s

### 2. Gemini (streaming)
- **Current:** `/api/gemini/[...path]`
- **New:** `/gemini/[...path]`
- **Auth header:** `x-goog-api-key` OR `?key=` query param (gateway token)
- **Upstream:** `https://generativelanguage.googleapis.com/[path]`
- **Features:** SSE streaming support, usage extraction from `usageMetadata`, model-specific pricing (Pro/Flash/Flash-Lite), embedding support
- **Timeout:** 300s
- **Methods:** GET, POST, PUT, DELETE, PATCH

### 3. Browserbase
- **Current:** `/api/browserbase/v1/[...path]`
- **New:** `/browserbase/v1/[...path]`
- **Auth header:** `X-BB-API-Key` (gateway token)
- **Upstream:** `https://api.browserbase.com/v1/[path]`
- **Features:** Auto-injects project ID on session create, logs session creates for billing
- **Timeout:** 120s
- **Methods:** GET, POST, PUT, DELETE, PATCH

### 4. Brave Search
- **Current:** `/api/brave/[...path]`
- **New:** `/brave/[...path]`
- **Auth header:** `X-Subscription-Token` (gateway token)
- **Upstream:** `https://api.search.brave.com/[path]`
- **Features:** Query param passthrough, result count tracking, rate limit header preservation
- **Timeout:** 30s
- **Methods:** GET, POST

### 5. Agentmail Send
- **Current:** `POST /api/user/email/send`
- **New:** `POST /email/send`
- **Auth:** `Authorization: Bearer <gateway-token>` OR Clerk session
- **Upstream:** `https://api.agentmail.to/v0/inboxes/{inbox}/messages/send`
- **Features:** 50/day rate limit per user (tracked in `email_sends` table), recipient validation
- **Note:** Also supports Clerk auth for dashboard access — need to handle this

### 6. Agentmail Inbox List
- **Current:** `GET /api/user/email/inbox`
- **New:** `GET /email/inbox`
- **Auth:** `Authorization: Bearer <gateway-token>` OR Clerk session
- **Upstream:** `https://api.agentmail.to/v0/inboxes/{inbox}/messages`
- **Features:** Pagination (limit/offset params)

### 7. Agentmail Message Detail
- **Current:** `GET /api/user/email/inbox/[messageId]`
- **New:** `GET /email/inbox/:messageId`
- **Auth:** `Authorization: Bearer <gateway-token>` OR Clerk session
- **Upstream:** `https://api.agentmail.to/v0/inboxes/{inbox}/messages/{messageId}`

### 8. Voice Call — Initiate
- **Current:** `POST /api/user/call`
- **New:** `POST /call`
- **Auth:** `Authorization: Bearer <gateway-token>`
- **Upstream:** `https://api.bland.ai/v1/calls`
- **Features:** E.164 phone validation, plan-based call limits, monthly minute tracking, per-user phone number lookup, Bland BYOT encrypted key, call record creation in `call_usage` table
- **Timeout:** 30s

### 9. Voice Call — Status
- **Current:** `GET /api/user/call/status?call_id=X`
- **New:** `GET /call/status?call_id=X`
- **Auth:** `Authorization: Bearer <gateway-token>`
- **Features:** Returns call status, transcript, summary, recording URL, scoped to user

### 10. Voice Call — Usage
- **Current:** `GET /api/user/call/usage`
- **New:** `GET /call/usage`
- **Auth:** `Authorization: Bearer <gateway-token>` OR Clerk session
- **Features:** Monthly usage stats, recent call history, phone number info

### NOT migrated (stays on Vercel)
- **Bland webhook** (`POST /api/webhooks/bland/status`) — Bland sends callbacks here, needs stable public URL. Keep on Vercel or move later with custom domain.
- **All dashboard/admin routes** — Clerk auth, user management, billing, provisioning
- **Gateway passthrough** (`/api/gateway/[path]`) — proxies to user machines
- **File API** (`/api/files/[path]`) — file uploads/downloads
- **WebSocket proxy** (`/api/ws/[path]`)

---

## Shared Libraries to Port

These exist in the Vercel app and need to be ported to the Fly proxy:

### Auth (`llm/_lib/auth.ts`)
- `authenticateGatewayToken(request)` — looks up gateway token in `machines` table via Turso
- Returns `{ userId, appName, machineId, plan }`
- Supports both `Authorization: Bearer` and `x-api-key` headers

### Rate Limiting (`llm/_lib/rate-limit.ts`)
- `checkRateLimits(user)` — checks monthly Automna Token budget + per-minute RPM
- Reads from `usage_events` (monthly totals) and `llm_rate_limits` (per-minute counters)
- Plan limits defined in `PLAN_LIMITS` constant:
  - Free: 10K AT, 5 RPM, 0 call minutes
  - Starter: 200K AT, 20 RPM, 0 call minutes
  - Pro: 1M AT, 60 RPM, 60 call minutes
  - Business: 5M AT, 120 RPM, 300 call minutes

### Usage Logging (`llm/_lib/usage.ts`)
- `logUsageBackground(record)` — writes to `llm_usage` table (detailed per-request log)
- Captures: userId, provider, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, costMicrodollars, durationMs, error

### Usage Events (`_lib/usage-events.ts`)
- `logUsageEventBackground(input)` — writes to `usage_events` table (unified billing)
- Converts microdollars to Automna Tokens: `ceil(costMicrodollars / 100)`
- `getUsedAutomnaTokens(userId)` — monthly total for rate limiting
- Event types: `llm`, `search`, `browser`, `call`, `email`, `embedding`

### Pricing (`llm/_lib/pricing.ts`)
- `calculateCostMicrodollars(model, input, output, cacheCreation, cacheRead)` — model-specific pricing
- Supports all Claude models (Opus 4/4.5/4.6, Sonnet 4/4.5, Haiku) with full names and short names
- Cache pricing: creation = 1.25x input, read = 0.1x input
- Returns microdollars (1 USD = 1,000,000 microdollars)

### Cost Constants (`_lib/cost-constants.ts`)
- `MICRODOLLARS_PER_AUTOMNA_TOKEN = 100`
- Fixed costs: Brave ($0.003/query), Browserbase ($0.02/session), Email ($0.002/send), Call ($0.09/min, $0.015/failed)

---

## Architecture

```
User Machine (Fly, sjc)       Fly Proxy App (sjc)          External APIs
    |                              |                            |
    | gateway token in header      |                            |
    |----------------------------->|                            |
    |                              |                            |
    |                   1. Validate token (Turso)               |
    |                   2. Check rate limits (Turso)             |
    |                   3. Swap token for real API key           |
    |                              |                            |
    |                              |--- real key --------------->|
    |                              |<--- response/stream --------|
    |                              |                            |
    |                   4. Extract usage from response           |
    |                   5. Log to llm_usage (Turso)             |
    |                   6. Log to usage_events (Turso)          |
    |                              |                            |
    |<----- stream/response -------|                            |
```

### Key difference: same-region, always-on
- User machines and proxy are both in **sjc** on Fly — minimal latency
- No cold starts, no function timeouts, no concurrency limits
- Node.js event loop handles hundreds of concurrent streams

---

## Tech Stack

- **Runtime:** Node.js 22 (matches user machines)
- **Framework:** Hono (lightweight, fast routing, middleware-friendly)
- **Database:** Turso (`libsql://automna-alexbbio.aws-us-west-2.turso.io`)
- **ORM:** Drizzle (same schema as landing app)

### App Structure

```
fly-proxy/
  src/
    index.ts                    # Hono app, all routes registered
    middleware/
      auth.ts                   # authenticateGatewayToken
      rate-limit.ts             # checkRateLimits + RPM counter
    routes/
      anthropic.ts              # POST /v1/messages (streaming + non-streaming)
      gemini.ts                 # /gemini/* (all methods, streaming)
      browserbase.ts            # /browserbase/v1/* (all methods)
      brave.ts                  # /brave/* (GET, POST)
      email.ts                  # /email/send, /email/inbox, /email/inbox/:id
      call.ts                   # /call, /call/status, /call/usage
    lib/
      db.ts                     # Turso/Drizzle client
      schema.ts                 # Shared schema (copied from landing)
      usage.ts                  # logUsageBackground
      usage-events.ts           # logUsageEventBackground, getUsedAutomnaTokens
      pricing.ts                # calculateCostMicrodollars
      cost-constants.ts         # Fixed costs
  Dockerfile
  fly.toml
  package.json
  tsconfig.json
```

---

## Environment Variables

### On Fly Proxy App

```bash
# Real API keys (moved from Vercel env)
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
BROWSERBASE_API_KEY=bb_...
BROWSERBASE_PROJECT_ID=...
BRAVE_API_KEY=BSA...
AGENTMAIL_API_KEY=...
BLAND_API_KEY=...
BLAND_BYOT_KEY=...

# Database
TURSO_URL=libsql://automna-alexbbio.aws-us-west-2.turso.io
TURSO_TOKEN=...

# App
NODE_ENV=production
PORT=8080
```

### On User Machines (updated base URLs)

```bash
# Before (Vercel)
ANTHROPIC_BASE_URL=https://automna.ai/api/llm
GOOGLE_API_BASE_URL=https://automna.ai/api/gemini
BROWSERBASE_API_URL=https://automna.ai/api/browserbase
BRAVE_API_URL=https://automna.ai/api/brave

# After (Fly proxy)
ANTHROPIC_BASE_URL=https://automna-proxy.fly.dev/llm
GOOGLE_API_BASE_URL=https://automna-proxy.fly.dev/gemini
BROWSERBASE_API_URL=https://automna-proxy.fly.dev/browserbase
BRAVE_API_URL=https://automna-proxy.fly.dev/brave
```

Email and call routes are called from the agent via gateway token auth — the base URL for those is set in the OpenClaw config or AGENTS.md instructions, not env vars. These will need to be updated in the workspace templates.

---

## Fly.io Config

```toml
# fly.toml
app = "automna-proxy"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"      # Always running — this is critical infra
  auto_start_machines = true
  min_machines_running = 1

[checks]
  [checks.health]
    type = "http"
    port = 8080
    path = "/health"
    interval = "30s"
    timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"                # Proxy is I/O bound, not CPU/memory
```

**Cost:** ~$3-5/month

**Scaling:** If needed, bump to `shared-cpu-2x` / `1gb` or add `min_machines_running = 2` for redundancy.

---

## Usage Tracking — Preservation Checklist

This is the most critical thing to get right. Every proxy route logs usage to two tables:

### Table: `llm_usage` (detailed per-request log)
| Field | Source |
|-------|--------|
| userId | From gateway token auth |
| provider | `anthropic`, `gemini`, `browserbase`, `brave` |
| model | Extracted from request body or URL path |
| inputTokens | From Anthropic `message_start` event or Gemini `usageMetadata` |
| outputTokens | From Anthropic `message_delta` event or Gemini `usageMetadata` |
| cacheCreationTokens | From Anthropic `message_start.usage.cache_creation_input_tokens` |
| cacheReadTokens | From Anthropic `message_start.usage.cache_read_input_tokens` |
| costMicrodollars | Calculated via `calculateCostMicrodollars()` |
| durationMs | `Date.now() - startTime` |
| error | Error message if request failed |

### Table: `usage_events` (unified billing / Automna Tokens)
| Field | Source |
|-------|--------|
| userId | From gateway token auth |
| eventType | `llm`, `search`, `browser`, `call`, `email`, `embedding` |
| automnaTokens | `ceil(costMicrodollars / 100)` |
| costMicrodollars | From pricing calculation or fixed costs |
| metadata | JSON with model, token counts, etc. |

### Table: `email_sends` (email rate limiting)
| Field | Source |
|-------|--------|
| userId | From auth |
| sentAt | Unix timestamp |
| recipient | First `to` address |
| subject | Email subject |

### Table: `call_usage` (call tracking)
| Field | Source |
|-------|--------|
| userId | From auth |
| blandCallId | From Bland API response |
| direction | `outbound` |
| toNumber / fromNumber | Request params / user's phone |
| status | `initiated` → updated by webhook |
| durationSeconds | From webhook |
| costCents | Calculated from duration |
| sessionKey | Locked at call initiation for routing |

### Verification steps before rollout:
1. Make a test LLM call through Fly proxy
2. Check `llm_usage` row exists with correct token counts
3. Check `usage_events` row exists with correct Automna Tokens
4. Verify `getUsedAutomnaTokens()` returns correct monthly total
5. Verify rate limiting kicks in at the right threshold

---

## Clerk Auth Consideration

Three routes currently support **both** gateway token AND Clerk session auth:
- `POST /api/user/email/send`
- `GET /api/user/email/inbox`
- `GET /api/user/call/usage`

This is because the dashboard UI can also call these endpoints (logged in via Clerk).

**Options:**
1. **Keep these routes on Vercel too** — dashboard calls go to Vercel, agent calls go to Fly proxy (duplicated routes)
2. **Dashboard calls go through a different path** — dashboard hits Vercel, which proxies to Fly proxy with a service token
3. **Move Clerk auth to Fly proxy** — install `@clerk/backend` in the proxy app

**Recommendation:** Option 1 for now. Keep the dashboard-facing email/call routes on Vercel. The Fly proxy only handles agent traffic (gateway token auth). This avoids adding Clerk as a dependency to the proxy. Can consolidate later.

---

## Migration Plan

### Phase 1: Build & Deploy (~1 day)
1. Create `fly-proxy/` directory in automna repo
2. Port all routes + shared libraries to Hono
3. Add health check endpoint (`GET /health`)
4. Deploy to `automna-proxy.fly.dev`
5. Verify health check and basic connectivity

### Phase 2: Test on One Machine (~1 hour)
1. Pick a test machine (Alex's instance)
2. Update its base URLs to point to Fly proxy
3. Make test calls: chat, search, email, etc.
4. Verify usage rows land in Turso correctly
5. Verify rate limiting works
6. Test streaming — ensure no timeouts, keepalives work

### Phase 3: Gradual Rollout (~1 day)
1. Update 2-3 more machines
2. Monitor Fly logs for errors
3. Compare usage logging accuracy vs Vercel proxy
4. Keep Vercel proxy routes active as fallback
5. If issues: revert machine URLs back to automna.ai

### Phase 4: Full Migration (~1 hour)
1. Update all remaining machines
2. Update provisioning code (`provision/route.ts`) to use Fly proxy URLs
3. Update Docker image `entrypoint.sh` for new machines
4. Update workspace templates (email/call instructions)

### Phase 5: Cleanup (~1 day)
1. Remove proxy routes from Vercel landing app (keep Clerk-auth dashboard routes)
2. Move API keys from Vercel env (keep copies for dashboard routes if needed)
3. Update `docs/API-PROXIES.md`
4. Update `TOOLS.md`

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Fly proxy goes down | All API calls fail for all users | Health checks + auto-restart. Keep Vercel routes as emergency fallback. |
| Turso latency for auth | +50-100ms per request | Cache gateway tokens in-memory with 5-min TTL |
| Usage logging fails | Billing inaccurate | Fire-and-forget with console.error logging. Same pattern as current. |
| Machine URL update requires restart | Brief downtime per machine | Machines restart quickly (~10s). Do one at a time. |
| Bland webhook still points to Vercel | N/A | Webhook stays on Vercel, no change needed |
| Email/call dashboard routes | Dashboard can't reach Fly proxy | Keep dashboard routes on Vercel (Option 1) |

---

## Performance Expectations

| Metric | Vercel (current) | Fly Proxy (expected) |
|--------|-----------------|---------------------|
| Cold start | 50-200ms | None (always on) |
| Max concurrent streams | Limited by plan | Hundreds (Node.js native) |
| Streaming timeout | Vercel function limit | None (5 min app-level) |
| Latency to Anthropic | Vercel edge → Anthropic | Fly sjc → Anthropic |
| Latency from user machine | Fly sjc → Vercel → Anthropic | Fly sjc → Fly sjc (local) |
| Monthly cost | Included in Vercel plan | ~$3-5/month |
