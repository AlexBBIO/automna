# Fly.io API Proxy - Migration Spec

## Problem

All API proxies currently run as **Vercel Edge Functions** on automna.ai. This works for quick request/response cycles but creates scaling issues with long-lived streaming connections (LLM calls):

- Vercel functions have concurrency limits per deployment
- Each LLM streaming request holds a function invocation open for 30-120+ seconds
- Concurrent requests compete for the same pool, causing 504 timeouts
- Cold starts add latency to burst traffic
- No connection pooling or request queuing

**Result:** As user count grows, burst traffic (heartbeats, concurrent chats) overwhelms the proxy and causes cascading 504s.

## Solution

Move all API proxies from Vercel Edge Functions to a **dedicated always-on Fly.io app**. The app handles concurrent streaming connections natively without function invocation limits.

## Architecture

```
User Machine (Fly)          Fly Proxy App            External APIs
(OpenClaw)                 (automna-proxy)
    |                           |                        |
    | Request + gateway token   |                        |
    |-------------------------->|                        |
    |                           |                        |
    |              1. Validate gateway token (Turso)     |
    |              2. Check rate limits                  |
    |              3. Forward with real API key          |
    |                           |----------------------->|
    |                           |<-----------------------|
    |              4. Log usage to Turso                 |
    |<--------------------------|                        |
```

### What moves to Fly:
| Proxy | Current Path | Fly Path | Streaming? |
|-------|-------------|----------|------------|
| Anthropic LLM | `/api/llm/v1/messages` | `/v1/messages` | Yes (SSE) |
| Gemini | `/api/gemini/[path]` | `/gemini/[path]` | Yes (SSE) |
| Browserbase | `/api/browserbase/v1/[path]` | `/browserbase/v1/[path]` | No |
| Brave Search | `/api/brave/[path]` | `/brave/[path]` | No |
| Agentmail (send) | `/api/user/email/send` | `/email/send` | No |
| Agentmail (inbox) | `/api/user/email/inbox` | `/email/inbox` | No |

### What stays on Vercel:
Everything that's dashboard/user-facing and doesn't proxy external APIs:
- Auth (Clerk webhooks, user routes)
- Provisioning (`/api/user/provision`)
- Admin panel routes
- Billing/Stripe
- Files API
- Gateway passthrough (`/api/gateway/[path]`)
- Chat UI / SSE sessions

## Tech Stack

- **Runtime:** Node.js (same as user machines, already on Fly)
- **Framework:** Hono (lightweight, fast, perfect for proxy work)
- **Database:** Turso (same as current, for auth + usage logging)
- **Deploy:** Single Fly app (`automna-proxy`), sjc region (same as user machines)

## Implementation

### App Structure

```
fly-proxy/
  src/
    index.ts              # Hono app entrypoint
    middleware/
      auth.ts             # Gateway token validation (Turso lookup)
      rate-limit.ts       # Per-user rate limiting
    routes/
      anthropic.ts        # /v1/messages proxy
      gemini.ts           # /gemini/* proxy
      browserbase.ts      # /browserbase/* proxy
      brave.ts            # /brave/* proxy
      email.ts            # /email/* proxy
    lib/
      usage.ts            # Usage logging to Turso
      pricing.ts          # Cost calculation
  Dockerfile
  fly.toml
```

### Key Differences from Vercel Version

1. **No function timeouts** - Streaming connections can run indefinitely
2. **True concurrency** - Node.js handles hundreds of concurrent streams
3. **Connection keep-alive** - Persistent connections to upstream APIs
4. **No cold starts** - Always running
5. **Same region** - User machines and proxy in sjc, minimal latency

### Auth Flow (unchanged)

1. User machine sends request with gateway token in header
2. Proxy validates token against `machines` table in Turso
3. Proxy looks up user's plan for rate limits
4. Proxy swaps gateway token for real API key
5. Proxy forwards request to upstream API
6. Proxy logs usage to Turso

### Environment Variables (on Fly proxy app)

```bash
# Real API keys (moved from Vercel)
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
BROWSERBASE_API_KEY=bb_...
BROWSERBASE_PROJECT_ID=...
BRAVE_API_KEY=BSA...
AGENTMAIL_API_KEY=...

# Database
TURSO_URL=libsql://automna-alexbbio.aws-us-west-2.turso.io
TURSO_TOKEN=...
```

### User Machine Config Changes

Update `ANTHROPIC_BASE_URL` and other base URLs on user machines to point to the Fly proxy instead of automna.ai:

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

Email stays routed through automna.ai since it uses Clerk auth for dashboard access too.

### Fly.io Config

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
  auto_stop_machines = "off"    # Always running
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"              # Proxy is lightweight
```

### Resources

- **CPU:** shared-cpu-1x (proxy is I/O bound, not CPU)
- **Memory:** 512MB (mostly streaming buffers)
- **Cost:** ~$3-5/month
- **Scaling:** Can bump to shared-cpu-2x or add min_machines_running = 2 if needed

## Migration Plan

### Phase 1: Build & Test
1. Create the Fly proxy app with all routes
2. Deploy to `automna-proxy.fly.dev`
3. Test with one machine (Alex's test instance)
4. Verify usage logging, rate limiting, streaming all work

### Phase 2: Gradual Rollout
1. Update 1-2 user machines to point to Fly proxy
2. Monitor for errors
3. Keep Vercel proxy routes active as fallback

### Phase 3: Full Migration
1. Update all remaining user machines
2. Update provisioning to use Fly proxy URLs for new machines
3. Update entrypoint.sh in Docker image

### Phase 4: Cleanup
1. Remove proxy routes from Vercel landing app
2. Move real API keys from Vercel env to Fly proxy env
3. Update API-PROXIES.md documentation

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Fly proxy goes down | All API calls fail | Auto-restart, health checks, Vercel fallback |
| Turso latency for auth | Added latency per request | Cache gateway tokens in-memory (TTL 5min) |
| Single region | Higher latency for non-US users | Can add proxy instances in other regions later |
| DNS/TLS issues | Connection failures | Use fly.dev domain initially, custom domain later |

## Monitoring

- Fly.io dashboard for uptime/memory/CPU
- Structured logs for request tracing
- Turso usage tables for billing accuracy
- Alert on error rate spike

## Timeline

- Phase 1: ~1 day (build + test)
- Phase 2: 1 day (gradual rollout)
- Phase 3: Same day if Phase 2 is clean
- Phase 4: Next day cleanup
