# API Proxies

All external API calls from user machines route through Automna proxies.

**Why:**
- Usage tracking per user (tokens, API calls, cost)
- Rate limiting
- Security - users never see real API keys
- Billing visibility across all services

## Proxied Services

| Service | Proxy Endpoint | Auth Header | Status |
|---------|---------------|-------------|--------|
| Anthropic | `/api/llm/v1/messages` | `x-api-key` | ✅ Production |
| Gemini | `/api/gemini/[path]` | `x-goog-api-key` or `?key=` | ✅ Production |
| Browserbase | `/api/browserbase/v1/[path]` | `X-BB-API-Key` | ✅ Production |
| Brave Search | `/api/brave/[path]` | `X-Subscription-Token` | ✅ Production |
| Agentmail | `/api/user/email/*` | Bearer token | ✅ Production |
| Voice Calls | `/api/user/call` | Bearer token | ✅ Production |
| Call Usage | `/api/user/call/usage` | Bearer token | ✅ Production |

## Architecture

```
User Machine                     Automna Proxy                 External API
(OpenClaw)                      (Vercel Edge)
    │                                │                              │
    │ Request with gateway token     │                              │
    │──────────────────────────────► │                              │
    │                                │                              │
    │                     1. Validate gateway token                 │
    │                     2. Lookup user in Turso                   │
    │                     3. Check rate limits                      │
    │                                │                              │
    │                                │ Request with real API key    │
    │                                │─────────────────────────────►│
    │                                │                              │
    │                                │◄─────────────────────────────│
    │                     4. Log usage to Turso                     │
    │◄──────────────────────────────│                              │
```

## Machine Environment Variables

User machines receive these env vars on provision:

```bash
# Auth
OPENCLAW_GATEWAY_TOKEN=<uuid>          # Primary auth token

# Anthropic (via proxy)
ANTHROPIC_API_KEY=<gateway-token>      # Gateway token, NOT real key
# ANTHROPIC_BASE_URL set in entrypoint.sh → https://automna.ai/api/llm

# Gemini (via proxy)
GEMINI_API_KEY=<gateway-token>         # Gateway token
GOOGLE_API_KEY=<gateway-token>         # Some SDKs use this
GOOGLE_API_BASE_URL=https://automna.ai/api/gemini

# Browserbase (via proxy)
BROWSERBASE_API_KEY=<gateway-token>    # Gateway token
BROWSERBASE_API_URL=https://automna.ai/api/browserbase
BROWSERBASE_PROJECT_ID=<project-id>    # Shared project ID

# Brave Search (via proxy)
BRAVE_API_KEY=<gateway-token>          # Gateway token
BRAVE_API_URL=https://automna.ai/api/brave

# Email (via proxy, no direct API key)
AGENTMAIL_INBOX_ID=<inbox-id>          # User's inbox
```

**Key insight:** Gateway token serves as the "API key" for all services. Proxies validate it, then forward with real keys.

## Vercel Environment Variables

Real API keys exist **only** in Vercel:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Real Anthropic API key |
| `GEMINI_API_KEY` | Real Google AI API key |
| `BROWSERBASE_API_KEY` | Real Browserbase API key |
| `BROWSERBASE_PROJECT_ID` | Browserbase project |
| `BRAVE_API_KEY` | Real Brave Search API key |
| `AGENTMAIL_API_KEY` | Real Agentmail API key |

---

## Anthropic Proxy

**Endpoint:** `POST /api/llm/v1/messages`

Matches Anthropic's API path structure so we can use `ANTHROPIC_BASE_URL`.

**Features:**
- Streaming support (SSE passthrough with usage extraction)
- Token counting for billing
- Request timeout (5 min)

**Files:**
- `src/app/api/llm/v1/messages/route.ts`
- `src/app/api/llm/_lib/auth.ts`
- `src/app/api/llm/_lib/usage.ts`

---

## Gemini Proxy

**Endpoint:** `/api/gemini/[...path]`

Proxies all Gemini Generative AI API calls.

**Example paths:**
- `/api/gemini/v1beta/models/gemini-pro:generateContent`
- `/api/gemini/v1beta/models/text-embedding-004:embedContent`

**Auth methods supported:**
- `x-goog-api-key` header (preferred)
- `?key=` query parameter

**Features:**
- All HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Streaming support for SSE responses
- Usage extraction from `usageMetadata`

**Files:**
- `src/app/api/gemini/[...path]/route.ts`

---

## Browserbase Proxy

**Endpoint:** `/api/browserbase/v1/[...path]`

Proxies all Browserbase API calls for browser automation.

**Example paths:**
- `/api/browserbase/v1/sessions` - Create/list sessions
- `/api/browserbase/v1/sessions/{id}` - Session details
- `/api/browserbase/v1/contexts` - Manage contexts

**Features:**
- Auto-injects project ID for session creation
- Logs session creates for billing
- All HTTP methods supported

**Files:**
- `src/app/api/browserbase/v1/[...path]/route.ts`

---

## Brave Search Proxy

**Endpoint:** `/api/brave/[...path]`

Proxies all Brave Search API calls.

**Example paths:**
- `/api/brave/res/v1/web/search?q=query` - Web search
- `/api/brave/res/v1/news/search?q=query` - News search
- `/api/brave/res/v1/images/search?q=query` - Image search
- `/api/brave/res/v1/videos/search?q=query` - Video search

**Auth:** `X-Subscription-Token` header (gateway token)

**Features:**
- All query parameters passed through
- Usage tracking (queries counted)
- Rate limit headers preserved

**Files:**
- `src/app/api/brave/[...path]/route.ts`

---

## Agentmail Proxy

**Endpoint:** `/api/user/email/*`

Different pattern - purpose-built endpoints, not transparent proxy.

**Endpoints:**
- `POST /api/user/email/send` - Send email (rate limited: 50/user/day)
- `GET /api/user/email/inbox` - List inbox messages
- `GET /api/user/email/inbox/[messageId]` - Get message details

**Files:**
- `src/app/api/user/email/send/route.ts`
- `src/app/api/user/email/inbox/route.ts`

---

## Usage Tracking

All proxy requests log to `llm_usage` table in Turso:

| Column | Description |
|--------|-------------|
| `user_id` | Clerk user ID |
| `provider` | `anthropic`, `gemini`, `browserbase` |
| `model` | Model/service name |
| `endpoint` | API endpoint called |
| `input_tokens` | Input tokens (LLM only) |
| `output_tokens` | Output tokens (LLM only) |
| `cost_microdollars` | Calculated cost |
| `duration_ms` | Request duration |
| `error` | Error message if failed |

---

## Rate Limiting

Implemented in `src/app/api/llm/_lib/rate-limit.ts`:

| Limit | Starter | Pro | Business |
|-------|---------|-----|----------|
| Monthly tokens | 1M | 5M | 20M |
| Monthly cost | $20 | $100 | $500 |
| Requests/min | 20 | 60 | 200 |

Rate limit responses use Anthropic-compatible format with `Retry-After` header.

---

## Security Model

| Secret | Location | Who can see |
|--------|----------|-------------|
| Real API keys | Vercel env only | Operators only |
| Gateway token | Turso + machine | Per-user, validated |

**Users cannot:**
- See real API keys
- Bypass rate limits
- Impersonate other users (token tied to their machine)

---

## Troubleshooting

### Requests not going through proxy

**Symptom:** Usage appears on direct API key, not in Turso

**Causes:**
1. SDK not respecting base URL env var
2. Old env vars on machine

**Fix:**
```bash
# Check machine env
fly ssh console -a automna-u-<id>
printenv | grep -E "GEMINI|BROWSERBASE|ANTHROPIC"

# Should show:
# GEMINI_API_KEY=<gateway-token>
# GOOGLE_API_BASE_URL=https://automna.ai/api/gemini
# etc.
```

### 401 Unauthorized from proxy

**Cause:** Invalid gateway token

**Fix:**
1. Check token exists in `machines` table
2. Verify token matches machine's env var
3. Regenerate token via admin panel if needed

### Cloudflare WAF blocking

**Symptom:** `403 Your request was blocked`

**Fix:** Add WAF skip rules in Cloudflare:
- `/api/llm/*`
- `/api/gemini/*`
- `/api/browserbase/*`
