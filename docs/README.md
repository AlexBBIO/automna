# Automna Documentation

## Active Docs

| Document | Description | Status |
|----------|-------------|--------|
| [FLY-MIGRATION-PLAN.md](FLY-MIGRATION-PLAN.md) | **Primary architecture doc** - Fly.io infrastructure, per-user provisioning, OpenClaw config | ✅ Current |
| [FLY-PROXY-SPEC.md](FLY-PROXY-SPEC.md) | Fly.io API proxy specification | ✅ Current |
| [AUTOMNA-TOKENS.md](AUTOMNA-TOKENS.md) | Automna Token system — unified billing currency | ✅ Current |
| [AUTOMNA-TOKENS-IMPL.md](AUTOMNA-TOKENS-IMPL.md) | Automna Tokens implementation details | ✅ Current |
| [VOICE-CALLING.md](VOICE-CALLING.md) | Voice calling feature (Twilio + Bland.ai) | ✅ Implemented |
| [EMAIL-SYSTEM.md](EMAIL-SYSTEM.md) | Email system (Agentmail) | ✅ Implemented |
| [API-PROXIES.md](API-PROXIES.md) | API proxy architecture | ✅ Current |
| [BYOK-SPEC.md](BYOK-SPEC.md) | Bring Your Own Key specification | 📝 Draft |
| [AGENT-CONFIG-SYSTEM.md](AGENT-CONFIG-SYSTEM.md) | Agent configuration and workspace setup | ✅ Current |
| [PER-USER-SETUP.md](PER-USER-SETUP.md) | Per-user provisioning guide | ✅ Current |
| [OPENCLAW-WEBSOCKET-PROTOCOL.md](OPENCLAW-WEBSOCKET-PROTOCOL.md) | OpenClaw WebSocket protocol reference | ✅ Reference |
| [STREAMING-SPEC.md](STREAMING-SPEC.md) | Streaming and media rendering | ✅ Current |
| [FILE-SYSTEM-SPEC.md](FILE-SYSTEM-SPEC.md) | File browser feature specification | ✅ Implemented |
| [FILE-BROWSER-SPEC.md](FILE-BROWSER-SPEC.md) | File browser UI specification | ✅ Implemented |
| [SIDEBAR-SPEC.md](SIDEBAR-SPEC.md) | Chat sidebar UI specification | ✅ Implemented |
| [SECURITY-HARDENING.md](SECURITY-HARDENING.md) | Security hardening documentation | ✅ Current |
| [REVERSE-PROXY-ARCHITECTURE.md](REVERSE-PROXY-ARCHITECTURE.md) | Caddy reverse proxy architecture | ✅ Current |
| [HEARTBEAT-IMPLEMENTATION.md](HEARTBEAT-IMPLEMENTATION.md) | Heartbeat system implementation | ✅ Current |
| [PHONE-CALL-SESSION-PERSISTENCE.md](PHONE-CALL-SESSION-PERSISTENCE.md) | Phone call session routing | ✅ Current |
| [COST-ANALYSIS.md](COST-ANALYSIS.md) | Cost analysis per user | ✅ Reference |
| [BROWSERBASE-SPEC.md](BROWSERBASE-SPEC.md) | Browserbase integration spec | ✅ Reference |
| [WORKFLOW-TEMPLATE.md](WORKFLOW-TEMPLATE.md) | Template for workflow documentation | 📋 Template |

## Quick Links

- **Main Spec:** `/SPEC.md` (root of project)
- **Proxy Source:** `/fly-proxy/` (Fly.io API proxy)

## Architecture Overview

```
User → automna.ai (Vercel)
         ↓
    Clerk Auth → Dashboard
         ↓
    /api/user/provision → Creates Fly.io app per user
         ↓
    automna-u-{shortId}.fly.dev (OpenClaw Gateway)
         ↓
    1GB encrypted volume (/home/node/.openclaw)
         ↓
    automna-proxy.fly.dev (API Proxy)
         ↓
    Claude API (Anthropic) + Brave + Browserbase + Agentmail
```

## Archive

Historical docs from earlier iterations (Cloudflare/Moltworker era) are in `./archive/`. These are kept for reference but are **not current**.

---

*Last updated: 2026-02-09*
