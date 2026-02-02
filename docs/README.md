# Automna Documentation

## Active Docs

| Document | Description | Status |
|----------|-------------|--------|
| [FLY-MIGRATION-PLAN.md](FLY-MIGRATION-PLAN.md) | **Primary architecture doc** - Fly.io infrastructure, per-user provisioning, OpenClaw config | ✅ Current |
| [INFRASTRUCTURE-COMPARISON.md](INFRASTRUCTURE-COMPARISON.md) | Comparison of infrastructure options (Cloudflare vs Fly.io vs others) | ✅ Reference |
| [FILE-SYSTEM-SPEC.md](FILE-SYSTEM-SPEC.md) | File browser feature specification | 🔧 In Progress |
| [FILE-SYSTEM-INTEGRATION.md](FILE-SYSTEM-INTEGRATION.md) | File browser implementation details | 🔧 In Progress |
| [SIDEBAR-SPEC.md](SIDEBAR-SPEC.md) | Chat sidebar UI specification | ✅ Implemented |
| [WORKFLOW-TEMPLATE.md](WORKFLOW-TEMPLATE.md) | Template for workflow documentation | 📋 Template |

## Quick Links

- **Main Spec:** `/SPEC.md` (root of project)
- **Landing Pages:** `/LANDING_PAGES.md`

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
    Claude API (Anthropic)
```

## Archive

Historical docs from earlier iterations (Cloudflare/Moltworker era) are in `./archive/`. These are kept for reference but are **not current**.

---

*Last updated: 2026-02-02*
