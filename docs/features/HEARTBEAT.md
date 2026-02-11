# Heartbeat Implementation

**Status:** ✅ Production  
**Created:** 2026-02-03  
**Updated:** 2026-02-08  
**Goal:** Enable periodic agent check-ins with Notifications channel for email monitoring and proactive awareness

---

## Overview

Agents check in every 30 minutes during active hours (8am-11pm user timezone). Findings are routed to a **Notifications** conversation that appears in the user's sidebar.

---

## Architecture

```
Every 30 min (8am-11pm)
    → Gateway sends heartbeat poll to agent
    → Agent reads HEARTBEAT.md for instructions
    → Agent checks email via Agentmail
    → If new items: sends summary to "Notifications" conversation
    → If nothing new: replies HEARTBEAT_OK
    → Updates heartbeat-state.json
```

### Notifications Channel

Instead of silently building awareness, agents now post findings to a dedicated **Notifications** conversation using:
```
sessions_send(label: "notifications", message: "📧 2 new emails: ...")
```

This creates a separate conversation in the user's sidebar where all periodic findings accumulate. The user can check it at their leisure.

---

## Config (in entrypoint.sh)

Heartbeat is configured in `clawdbot.json`, written by the entrypoint on every boot:

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "activeHours": {
          "start": "08:00",
          "end": "23:00"
        },
        "target": "last"
      }
    }
  }
}
```

### Workspace Files

- `HEARTBEAT.md` — Agent instructions (check email, post to Notifications)
- `heartbeat-state.json` — State tracking (last check timestamps, counts)

Both are in `/app/default-workspace/` in the Docker image and copied on first init.

### Workspace Version

Current workspace version: **6** (includes Notifications channel instructions).

Migration v5→v6 patches existing users' HEARTBEAT.md on next boot.

---

## Existing Users

Machine image update applies both config and workspace changes:

```bash
fly machines update <machine-id> -a automna-u-xxx \
  --image registry.fly.io/automna-openclaw-image:latest --yes
```

- Config: Overwritten on every boot (heartbeat section included automatically)
- HEARTBEAT.md: Patched by workspace migration v5→v6

---

## Token Cost Estimate

Per heartbeat cycle (assuming email check):
- Heartbeat prompt: ~200 tokens
- HEARTBEAT.md read: ~300 tokens
- Email API call + response: ~500 tokens
- State update: ~200 tokens
- **Total: ~1,200 tokens per heartbeat**

Per user per day (30 heartbeats at 30min intervals, 8am-11pm):
- **~36,000 tokens/day** (~$0.11/day at Claude Sonnet rates)

---

## Rollout History

| Date | Change |
|------|--------|
| 2026-02-03 | Initial HEARTBEAT.md + heartbeat-state.json added to Docker image |
| 2026-02-08 | Heartbeat config added to clawdbot.json (was missing) |
| 2026-02-08 | Notifications channel: agents post to "Notifications" conversation |
| 2026-02-08 | Workspace migration v5→v6 for existing users |
| 2026-02-08 | First rollout: grandathrawn@gmail.com (automna-u-1llgzf6t2spw) |
