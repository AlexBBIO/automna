# Automna — Architecture Overview

> Last updated: 2026-02-11

## System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  automna.ai (Vercel / Next.js)                                   │
│                                                                  │
│  ┌─────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │ Landing  │  │  Dashboard   │  │  API Routes                │  │
│  │ page.tsx │  │  (Clerk auth)│  │  /api/user/* (provision,   │  │
│  │          │  │  Chat, Files │  │   gateway, sessions, etc.) │  │
│  │          │  │  Settings    │  │  /api/webhooks/* (Stripe,  │  │
│  │          │  │  Integrations│  │   Clerk, Bland)            │  │
│  └─────────┘  └──────┬───────┘  │  /api/admin/* (admin panel)│  │
│                       │         │  /api/ws/* (WS proxy)       │  │
│                       │         └────────────┬───────────────┘  │
│                       │                      │                   │
│                       ▼                      ▼                   │
│              ┌─────────────────────────────────┐                │
│              │  Turso DB (libsql)              │                │
│              │  users, machines, llm_usage,    │                │
│              │  call_usage, phone_numbers,     │                │
│              │  email_sends, provision_status  │                │
│              └─────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────┘
         │ WebSocket proxy                    │ HTTP
         ▼                                    ▼
┌──────────────────────┐      ┌────────────────────────────────┐
│ Per-User Fly App     │      │ automna-proxy.fly.dev          │
│ automna-u-{shortId}  │      │ (Bun + Hono, sjc, 2 machines) │
│                      │      │                                │
│ Caddy (:18789)       │      │ /api/llm/*   → Anthropic      │
│ ├── /* → OpenClaw    │      │ /api/brave/* → Brave Search    │
│ │      (:18788)      │      │ /api/browserbase/* → BB API    │
│ └── /files/* → File  │      │ /api/user/email/* → Agentmail  │
│        Server (:8080)│      │ /api/user/call/*  → Bland.ai   │
│                      │      │                                │
│ 2GB RAM, 1 vCPU     │      │ Auth: gateway token per user   │
│ 1GB encrypted volume │      │ Rate limits: per plan          │
└──────────────────────┘      └────────────────────────────────┘
```

## Component Map

| Component | Location | Tech | Deploys To |
|-----------|----------|------|------------|
| Landing + Dashboard | `/landing/src/` | Next.js 14, React, Tailwind | Vercel |
| API routes | `/landing/src/app/api/` | Next.js Route Handlers | Vercel |
| API Proxy | `/fly-proxy/` | Bun + Hono | Fly.io (`automna-proxy`) |
| Docker image | `/docker/` | Dockerfile + entrypoint.sh | Fly.io registry |
| DB schema | `/landing/src/lib/db/schema.ts` | Drizzle ORM + Turso | — |
| Default workspace | `/docker/default-workspace/` | Markdown + JSON | Baked into Docker image |

## Key Flows

### New User Signup
See `PROVISIONING.md` for the full flow.

### Chat Message
1. User types in dashboard → sends via WebSocket
2. Vercel WS proxy → forwards to user's Fly app
3. OpenClaw gateway processes → calls Anthropic via proxy
4. Streaming response back through same WS chain
5. See `STREAMING.md` for protocol details

### Integration Setup
1. User clicks integration in dashboard
2. Setup prompt sent to agent in chat
3. Agent guides user through configuration
4. Agent modifies its own OpenClaw config
5. See `../features/INTEGRATIONS.md` (to be written)

## Data Storage

| Data | Where | Persistence |
|------|-------|-------------|
| User accounts, billing | Clerk + Turso | Permanent |
| Machine mapping, tokens | Turso `machines` table | Permanent |
| LLM usage, call logs | Turso | Permanent |
| Chat history, memory | Fly volume (JSONL files) | Per-user volume |
| Agent workspace files | Fly volume | Per-user volume |
| Browser sessions | Browserbase (cloud) | Per-context |

## Auth Model

| Surface | Method |
|---------|--------|
| Dashboard → Vercel API | Clerk session cookie |
| Vercel API → User's Fly app | Gateway token (per-user UUID in Turso) |
| Vercel API → Proxy | Gateway token (same) |
| Agent → Proxy | `$OPENCLAW_GATEWAY_TOKEN` env var |
| Admin panel | Clerk + admin role check |
