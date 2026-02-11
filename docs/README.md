# Automna Documentation

> Last reorganized: 2026-02-11

## How to Use These Docs

**Starting a task?** Read in this order:
1. `STATUS.md` — What's live, what's broken, what's in progress
2. The relevant section folder for your area of work
3. `WISHLIST.md` — Feature backlog and priorities

**New to the project?** Read:
1. `STATUS.md` — Current state
2. `architecture/OVERVIEW.md` — How everything fits together
3. `architecture/PROVISIONING.md` — How users get set up

---

## Directory Structure

```
docs/
├── README.md                  ← You are here
├── STATUS.md                  ← Current state of everything (what works, what doesn't)
├── WISHLIST.md                ← Feature backlog, prioritized
│
├── architecture/              ← How the system works
│   ├── OVERVIEW.md            ← Architecture diagram + component map
│   ├── PROVISIONING.md        ← User signup → running agent flow
│   ├── REVERSE-PROXY.md       ← Caddy routing (ports, paths)
│   ├── WEBSOCKET-PROTOCOL.md  ← OpenClaw WS protocol reference
│   ├── STREAMING.md           ← Chat streaming + media rendering
│   └── DOCKER.md              ← Docker image, entrypoint, workspace migrations
│
├── features/                  ← Feature specs (how each feature works)
│   ├── CHAT.md                ← Chat UI, message rendering, conversations
│   ├── FILE-BROWSER.md        ← File tree, upload/download, viewer
│   ├── INTEGRATIONS.md        ← Integration panel + setup flows
│   ├── VOICE-CALLING.md       ← Twilio + Bland.ai phone system
│   ├── EMAIL.md               ← Agentmail system
│   ├── BROWSERBASE.md         ← Browser automation (persistent contexts)
│   ├── HEARTBEAT.md           ← Agent periodic checks
│   ├── CREDITS.md             ← Credit/billing system
│   ├── ADMIN-PANEL.md         ← Admin dashboard
│   ├── SECRETS.md             ← User secrets management
│   └── SETTINGS.md            ← Settings panel, agent info
│
├── infrastructure/            ← Ops, deployment, security
│   ├── FLY-MACHINES.md        ← Per-user Fly apps, machine config
│   ├── API-PROXY.md           ← Centralized proxy (LLM, Brave, Browserbase, email)
│   ├── SECURITY.md            ← Security model, hardening, known risks
│   ├── AGENT-CONFIG.md        ← OpenClaw config generation, workspace setup
│   ├── COST-ANALYSIS.md       ← Per-user costs, per-action costs
│   └── DEPLOYMENT.md          ← How to deploy (Vercel, Docker, Fly)
│
├── business/                  ← Strategy, pricing, GTM
│   ├── PRICING.md             ← Tiers, limits, strategy
│   ├── MARKET-ANALYSIS.md     ← Competitors, positioning
│   └── GTM.md                 ← Go-to-market plan
│
├── postmortems/               ← What went wrong and what we learned
│   └── AGENT-ACTIVITY-TOGGLE.md
│
└── archive/                   ← Historical docs (Cloudflare/Moltworker era)
    └── (unchanged)
```

## Quick Reference

| What | Where |
|------|-------|
| Main source code | `/landing/src/` |
| Docker image source | `/docker/` |
| API proxy source | `/fly-proxy/` |
| Turso DB schema | `/landing/src/lib/db/schema.ts` |
| OpenClaw config template | `/docker/entrypoint.sh` (generated at boot) |
