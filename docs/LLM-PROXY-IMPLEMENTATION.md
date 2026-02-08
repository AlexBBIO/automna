> **⚠️ OUTDATED:** This document describes the legacy Vercel proxy. The current proxy runs on Fly.io. See [API-PROXIES.md](API-PROXIES.md) for the current architecture.

# API Proxy Implementation

## Status: ✅ All Proxies Complete (2026-02-04)

All external API calls now route through Automna proxies.

## What's Implemented

### Anthropic Proxy ✅
- **Path:** `/api/llm/v1/messages`
- **Runtime:** Vercel Edge
- **Auth:** Gateway token via `x-api-key` header
- **Features:** Streaming support, usage logging, rate limiting

### Gemini Proxy ✅ (Added 2026-02-04)
- **Path:** `/api/gemini/[...path]`
- **Runtime:** Vercel Edge
- **Auth:** Gateway token via `x-goog-api-key` header or `?key=` param
- **Features:** All methods, streaming support, usage logging

### Browserbase Proxy ✅ (Added 2026-02-04)
- **Path:** `/api/browserbase/v1/[...path]`
- **Runtime:** Vercel Edge
- **Auth:** Gateway token via `X-BB-API-Key` header
- **Features:** All methods, auto project ID injection, session logging

### Agentmail Proxy ✅
- **Path:** `/api/user/email/*`
- **Auth:** Gateway token via Bearer header
- **Features:** Rate limiting (50/day), send and inbox endpoints

## Machine Configuration

User machines receive gateway token as "API key" for all services:

```bash
# All set to gateway token (NOT real keys!)
ANTHROPIC_API_KEY=<gateway-token>
GEMINI_API_KEY=<gateway-token>
GOOGLE_API_KEY=<gateway-token>
BROWSERBASE_API_KEY=<gateway-token>

# Base URLs point to our proxies
GOOGLE_API_BASE_URL=https://automna-proxy.fly.dev/api/gemini
BROWSERBASE_API_URL=https://automna-proxy.fly.dev/api/browserbase
# ANTHROPIC_BASE_URL set in entrypoint.sh
```

## Security Model

| Secret | Location | Who can see |
|--------|----------|-------------|
| Real API keys | Vercel env only | Operators only |
| Gateway token | Turso + machine | Per-user, validated |

**Users cannot:**
- See real API keys (they only have gateway token)
- Bypass rate limits (all traffic goes through proxy)
- Abuse shared quotas (usage tracked per-user)

## Files

| File | Purpose |
|------|---------|
| `src/app/api/llm/v1/messages/route.ts` | Anthropic proxy |
| `src/app/api/gemini/[...path]/route.ts` | Gemini proxy |
| `src/app/api/browserbase/v1/[...path]/route.ts` | Browserbase proxy |
| `src/app/api/user/email/*/route.ts` | Email proxy endpoints |
| `src/app/api/llm/_lib/auth.ts` | Token validation |
| `src/app/api/llm/_lib/usage.ts` | Usage logging |
| `src/app/api/llm/_lib/rate-limit.ts` | Rate limiting |
| `src/app/api/user/provision/route.ts` | Sets up machine env vars |

## Issues Resolved

### 2026-02-03
1. **Cloudflare WAF blocking LLM requests** - Added skip rules
2. **Fly secrets overriding env vars** - Removed stale secrets
3. **SSE chunk boundary issues** - Buffered parsing

### 2026-02-04
1. **Raw API keys exposed to user machines** - Now all proxied
2. **No usage tracking for Gemini/Browserbase** - Now logged

## Next Steps

- [x] ~~Anthropic proxy~~ (Done)
- [x] ~~Gemini proxy~~ (Done 2026-02-04)
- [x] ~~Browserbase proxy~~ (Done 2026-02-04)
- [x] ~~Email proxy~~ (Done)
- [ ] Add Cloudflare WAF rules for new proxy paths
- [ ] Alert on unusual usage patterns
- [ ] Per-user usage breakdown in admin panel
