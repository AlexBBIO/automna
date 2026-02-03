# Heartbeat Implementation Plan

**Status:** ✅ Implemented  
**Created:** 2026-02-03  
**Goal:** Enable periodic agent check-ins for email monitoring and proactive awareness

---

## Overview

Add heartbeat functionality to Automna user agents so they can:
1. Periodically check email inbox for new messages
2. Build awareness of user context between conversations
3. Mention relevant updates when user next chats

This leverages OpenClaw's built-in heartbeat system rather than custom polling code.

---

## Implementation (Completed 2026-02-03)

Heartbeat is now built into the Docker image. No provisioning changes needed.

### Docker Image Updates

**Files added to `/app/default-workspace/`:**
- `HEARTBEAT.md` - Instructions for heartbeat tasks
- `heartbeat-state.json` - State tracking file

**Config in `entrypoint.sh`:**
```json
{
  "heartbeat": {
    "enabled": true,
    "intervalMs": 1800000,
    "prompt": "Read HEARTBEAT.md and follow instructions. If nothing needs attention, reply HEARTBEAT_OK."
  }
}
```

### How It Works

1. On first boot, Docker image copies default workspace files
2. Config file is created with heartbeat enabled
3. Every 30 min, gateway sends heartbeat poll to agent
4. Agent checks HEARTBEAT.md, checks email, updates state
5. Agent replies HEARTBEAT_OK or surfaces alerts

### Existing Users

Existing users need their machines updated to get heartbeat:

**Option A: Delete and re-provision**
- User logs out, we delete their machine, they log back in
- Gets fresh image with all features

**Option B: Update machine image in-place**
```bash
fly machines update <machine-id> -a automna-u-xxx \
  --image registry.fly.io/automna-openclaw-image:latest --yes
```

**Option C: Manual config**
- User asks their agent to add heartbeat config via gateway tool

---

## Token Cost Estimate

Per heartbeat cycle (assuming email check):
- Heartbeat prompt: ~200 tokens
- HEARTBEAT.md read: ~300 tokens
- Email API call + response: ~500 tokens
- State update: ~200 tokens
- **Total: ~1,200 tokens per heartbeat**

Per user per day (48 heartbeats at 30min intervals):
- **~57,600 tokens/day** (~$0.17/day at Claude Sonnet rates)

**Mitigation options:**
- Increase interval to 1 hour (24 heartbeats, ~$0.09/day)
- Use cheaper model for heartbeats (e.g., Haiku)
- Make heartbeats opt-in rather than default

---

## Testing Plan

1. **Local test:** Enable heartbeat on a test OpenClaw instance
2. **Verify cycle:** Confirm heartbeat fires at correct interval
3. **Email check:** Verify agent can list emails during heartbeat
4. **State persistence:** Confirm heartbeat-state.json updates correctly
5. **User experience:** Test that agent mentions new emails in next chat

---

## Rollout Plan

1. **Phase 1:** Implement for new users only (default enabled)
2. **Phase 2:** Create migration for existing users (opt-in)
3. **Phase 3:** Monitor token usage and adjust interval if needed

---

## Decisions (2026-02-03)

1. **Interval:** 30 minutes ✓
2. **Default state:** Enabled by default ✓
3. **Model:** Opus 4.5 (same as default) ✓
4. **Scope:** Email for now, expand later

---

## Files to Modify

| File | Change |
|------|--------|
| `landing/src/app/api/user/provision/route.ts` | Add heartbeat config + workspace files |
| `landing/src/lib/templates/config.yaml` | Add heartbeat section (if using template) |
| `landing/src/lib/templates/HEARTBEAT.md` | Create template |
| `landing/src/lib/templates/heartbeat-state.json` | Create template |
| `docs/MVP-STEPS.md` | Document heartbeat feature |
| `SPEC.md` | Update with heartbeat architecture |

---

## Dependencies

- OpenClaw heartbeat feature must be working (it is, we use it ourselves)
- Agentmail integration must be complete (it is)
- User must have email address assigned (they do, during provisioning)
