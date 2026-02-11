# Automna — Current Status

> Last updated: 2026-02-11

## What's Live (Production)

| Component | Status | Notes |
|-----------|--------|-------|
| Landing page | ✅ | automna.ai on Vercel |
| Clerk auth | ✅ | Sign up/sign in |
| Stripe billing | ✅ | Checkout, webhooks, portal. 4 tiers ($20/$79/$149/$299) |
| Per-user provisioning | ✅ | Fly.io apps: `automna-u-{shortId}.fly.dev` |
| WebSocket chat | ✅ | Token auth, streaming, multi-conversation |
| Chat history | ✅ | Via WS, stored on Fly volumes |
| Multi-conversation sidebar | ✅ | Server-side sessions via OpenClaw API |
| LLM Proxy | ✅ | Centralized via `automna-proxy.fly.dev`, usage tracking, rate limits |
| Media rendering | ✅ | Inline images, MEDIA: paths, file downloads |
| Heartbeat system | ✅ | 30-min periodic agent checks |
| Files API + Browser | ✅ | Caddy reverse proxy → file server. Upload/download/edit |
| Agent config & memory | ✅ | Workspace injection, Gemini embeddings, session memory |
| Security hardening | ✅ | No API keys on user machines, all proxied |
| Voice calling | ✅ | Twilio + Bland.ai BYOT, outbound + inbound |
| Email (Agentmail) | ✅ | Per-user email addresses, proxied sends |
| Browserbase | ✅ | Persistent browser contexts per user |
| Admin panel | ✅ | User management, health, stats, announcements |
| Secrets manager | ✅ | Users can store API keys |
| Tool status indicators | ✅ | Shows what agent is doing during tool calls |
| Provisioning loading screen | ✅ | Real HTTP health polling, error + retry |

## What's In Progress

| Component | Status | Notes |
|-----------|--------|-------|
| Credit system (unified billing) | 🔧 Spec done | `AUTOMNA-CREDITS.md` — not yet implemented |
| BYOK (Bring Your Own Key) | 📝 Draft spec | `BYOK-SPEC.md` |
| Provisioning live progress | 📝 Spec done | `PROVISION-STATUS-SPEC.md` — real stage tracking from backend |

## What's Not Started (but needed)

See `WISHLIST.md` for the full prioritized backlog.

## Known Issues

| Issue | Severity | Workaround |
|-------|----------|------------|
| Session key mismatch (OpenClaw bug) | Low | Background fixer in entrypoint polls every 3s |
| ~60s cold start on first load | Medium | ChatSkeleton with tips. No real fix without always-on machines |
| No staging environment | Medium | All deploys go straight to prod |
| No automated tests for Next.js app | Medium | Manual testing only |
| Gateway tokens stored plaintext in Turso | Low | Would need hashing + lookup change |

## Architecture Summary

```
automna.ai (Vercel / Next.js)
    ├── Landing page
    ├── Dashboard (Clerk auth)
    ├── API routes → Turso DB
    └── WS proxy → per-user Fly app
            │
            ▼
automna-u-{shortId}.fly.dev (Fly.io)
    └── Caddy (:18789)
            ├── /* → OpenClaw Gateway (:18788)
            └── /files/* → File Server (:8080)
                    └── 1GB encrypted volume
            │
            ▼
automna-proxy.fly.dev (Fly.io)
    └── API Proxy (Bun + Hono)
            ├── /api/llm/* → Anthropic
            ├── /api/brave/* → Brave Search
            ├── /api/browserbase/* → Browserbase
            ├── /api/user/email/* → Agentmail
            └── /api/user/call/* → Bland.ai
```
