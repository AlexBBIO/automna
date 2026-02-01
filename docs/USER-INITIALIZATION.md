# User Instance Initialization Spec

How we bootstrap a new Automna user's agent instance.

## Current Approach: Use Clawdbot Defaults

We use `clawdbot setup --non-interactive` to initialize the workspace with standard Clawdbot files. This gives us a solid foundation that includes memory handling, personality, and all the hooks we'll need for future features.

## What Happens When a User Signs Up

1. **Clerk auth** - User signs up via Clerk
2. **DB record** - User synced to our database via `/api/user/sync`
3. **Moltworker provisioning** - On first dashboard visit:
   - Gateway URL generated with auth params
   - Moltworker container spun up on Cloudflare Sandbox
   - R2 bucket mounted for persistence
4. **Workspace bootstrap** - On first run (no R2 backup):
   - `clawdbot setup --non-interactive` creates default workspace files
   - Files synced to R2 for persistence

## Persistence

- **Config** (`~/.clawdbot/`) synced to R2 every 30 seconds
- **Workspace** (`/root/clawd/`) synced to R2 every 30 seconds
- On container restart, restored from R2 backup

---

## Clawdbot Default Workspace Files

Created by `clawdbot setup`. These are our baseline.

### Core Files (Loaded Every Session)

| File | Purpose | Notes |
|------|---------|-------|
| `AGENTS.md` | Operating instructions | Memory workflow, safety rules, group chat behavior, heartbeat handling |
| `SOUL.md` | Personality & boundaries | "Be genuinely helpful", opinions allowed, earn trust through competence |
| `USER.md` | User info | Name, timezone, preferences - agent fills this in |
| `TOOLS.md` | Local tool notes | Conventions, SSH details, voice preferences |

### Memory Files

| File | Purpose | Notes |
|------|---------|-------|
| `MEMORY.md` | Curated long-term memory | Only loaded in main/private sessions (security) |
| `memory/YYYY-MM-DD.md` | Daily session logs | Today + yesterday loaded each session |

### Special Files

| File | Purpose | Notes |
|------|---------|-------|
| `IDENTITY.md` | Agent's name, emoji, avatar | Created during bootstrap ritual |
| `BOOTSTRAP.md` | First-run ritual | One-time; deleted after completion |
| `HEARTBEAT.md` | Periodic check tasks | Agent edits this for reminders |

### Directory Structure

```
/root/clawd/                    # Agent workspace
├── AGENTS.md                   # Operating instructions
├── SOUL.md                     # Personality
├── USER.md                     # User info (agent fills in)
├── IDENTITY.md                 # Agent identity (created at bootstrap)
├── TOOLS.md                    # Local tool notes
├── MEMORY.md                   # Long-term memory
├── HEARTBEAT.md                # Periodic tasks
├── memory/                     # Daily logs
│   └── YYYY-MM-DD.md
└── skills/                     # Custom skills
```

---

## Key Behaviors from AGENTS.md

These are the defaults we get. Document here so we can adjust later.

### Memory Workflow
- Agent wakes fresh each session
- Reads SOUL.md, USER.md, memory files at start
- MEMORY.md only in main session (privacy)
- "If you want to remember something, WRITE IT TO A FILE"
- Daily files are raw logs; MEMORY.md is curated wisdom

### Safety Rules
- Don't exfiltrate private data
- `trash` > `rm`
- Ask before external actions (emails, tweets)
- Internal actions (reading, organizing) are safe

### Group Chat Behavior
- Respond when mentioned or can add value
- Stay silent when conversation flows without you
- "Quality > quantity"
- Use emoji reactions naturally

### Heartbeat Handling
- Periodic checks: email, calendar, mentions, weather
- Track last check times in `memory/heartbeat-state.json`
- Be proactive but not annoying
- Respect quiet time (23:00-08:00)

---

## Future Features (Already Supported)

These are built into Clawdbot but not yet enabled for Automna users:

| Feature | Status | Notes |
|---------|--------|-------|
| Heartbeats | Not configured | Need to set up polling interval |
| Cron jobs | Not configured | Need gateway config |
| Memory search | Not configured | Needs embedding API key |
| Telegram | Not configured | Need bot token |
| Discord | Not configured | Need bot token |
| WhatsApp | Not configured | Requires QR pairing |

---

## Roadmap

### Phase 1: Clawdbot Defaults ✅
- [x] Use `clawdbot setup` for workspace initialization
- [x] Document all default files and behaviors
- [ ] Deploy updated container

### Phase 2: Heartbeats & Cron
- [ ] Enable heartbeat polling
- [ ] Configure cron job support
- [ ] Add reminder functionality

### Phase 3: Enhanced Memory
- [ ] Configure memory search (vector embeddings)
- [ ] Enable session memory indexing
- [ ] Add Supermemory integration

### Phase 4: Channel Support
- [ ] Telegram integration
- [ ] Discord integration
- [ ] WhatsApp integration

---

## Configuration Reference

### Container Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | LLM access |
| `MOLTBOT_GATEWAY_TOKEN` | Gateway auth |
| `MOLTBOT_USER_ID` | Per-user R2 path isolation |
| `DEV_MODE` | Skip auth (dev only) |

### R2 Backup Structure

```
/data/moltbot/users/{userId}/
├── config/                     # ~/.clawdbot/ backup
│   ├── clawdbot.json
│   └── agents/
└── workspace/                  # /root/clawd/ backup
    ├── AGENTS.md
    ├── SOUL.md
    ├── USER.md
    └── memory/
```

---

## Admin Operations

### Reset User Workspace

To reset a user's workspace to defaults (triggers fresh `clawdbot setup` on next login):

```bash
# Generate signed URL for the user
node -e "
const crypto = require('crypto');
const secret = 'MOLTBOT_SIGNING_SECRET_HERE';
const userId = 'user_xxxxx';
const exp = Math.floor(Date.now() / 1000) + 3600;
const payload = userId + '.' + exp;
const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
console.log('curl -X POST \"https://moltbot-sandbox.alex-0bb.workers.dev/api/reset-workspace?userId=' + userId + '&exp=' + exp + '&sig=' + sig + '\"');
"

# Run the generated curl command
```

This deletes the user's workspace backup from R2. On next login, `clawdbot setup` runs fresh.

---

## Open Questions

1. **Onboarding flow** - Should we have a first-run conversation where the agent asks the user's name, preferences, etc.?

2. **Agent identity** - Should each user's agent have a unique name/personality, or all be "Automna"?

3. **Memory retention** - How long to keep daily memory files? Auto-archive after N days?

4. **Multi-agent** - Future support for users having multiple specialized agents?
