# Automna Next Steps Analysis

**Date:** 2026-02-03  
**Status:** Post-MVP Core, Pre-Launch

---

## Current State Assessment

### ✅ What's Working Well

| Feature | Status | Notes |
|---------|--------|-------|
| Infrastructure | ✅ Solid | Fly.io per-user apps, encrypted volumes |
| Auth + Billing | ✅ Working | Clerk + Stripe, webhooks functional |
| Web Chat | ✅ Polished | Multi-conversation, streaming, code blocks |
| File Management | ✅ Complete | Upload, download, browse, inline images |
| Media Rendering | ✅ Working | `MEDIA:` syntax, user + agent images |
| Memory System | ✅ Enabled | Gemini embeddings, session memory |
| Sessions API | ✅ Working | List, rename, delete conversations |

### 🔴 Critical Gaps (vs. Value Proposition)

The SPEC promises: *"Pre-configured integrations (Discord, Telegram, WhatsApp, web)"*

**Currently: Web only.** This is the biggest gap.

| Gap | Impact | Effort |
|-----|--------|--------|
| No Discord integration | Users can't reach agent from Discord | ~4-6h |
| No Telegram integration | Users can't reach agent from Telegram | ~4h |
| No browser automation | Agents can't "do things" on the web | ~6h |
| No agent configuration | Users can't customize their agent | ~4h |
| No onboarding | Users don't know what's possible | ~3h |

---

## OpenClaw Capabilities Analysis

### Already Working (Enabled by Default)
- ✅ Chat streaming
- ✅ Memory search (Gemini embeddings)
- ✅ Session memory
- ✅ File operations (read/write/exec)
- ✅ Web search
- ✅ Web fetch
- ✅ Context pruning/compaction

### Available but Not Exposed to Users

**Channel Integrations (HIGH VALUE):**
| Channel | OpenClaw Support | Setup Required |
|---------|-----------------|----------------|
| Discord | ✅ Built-in | Bot token from Discord Developer Portal |
| Telegram | ✅ Built-in | Bot token from BotFather |
| WhatsApp | ✅ Built-in | QR code linking (WhatsApp Business API) |
| Slack | ✅ Built-in | Bot token from Slack API |
| Signal | ✅ Built-in | signal-cli setup |
| iMessage | ✅ via BlueBubbles | BlueBubbles server on Mac |

**Automation Tools:**
| Tool | What It Does | Value |
|------|-------------|-------|
| Browser | Full Playwright control | Web automation, scraping, form filling |
| Cron | Scheduled tasks | Recurring checks, reminders |
| Nodes | Device pairing | Mobile camera, location, notifications |
| TTS | Text to speech | Voice responses |
| Skills | 51 available | GitHub, weather, deep research, etc. |

**Skills Ready to Use (11/51):**
- bluebubbles, clawdhub, github, skill-creator
- slack, tmux, weather
- gemini-deep-research, substack-formatter, nano-banana-pro, notion

---

## Recommended Next Steps (Priority Order)

### 1. 🔌 Discord Integration UI (P0) — ~4-6h

**Why:** Biggest differentiator. "Your agent in your Discord DMs."

**Implementation:**
1. Add "Integrations" tab to dashboard
2. Guide user through Discord bot creation:
   - Link to Discord Developer Portal
   - Step-by-step: Create App → Bot → Copy Token
   - Input field for bot token
3. API endpoint to update user's OpenClaw config:
   ```json
   {
     "channels": {
       "discord": {
         "enabled": true,
         "token": "user-provided-token",
         "allowlist": { "dm": ["user-discord-id"] }
       }
     }
   }
   ```
4. Restart gateway to apply config
5. Show connection status (online/offline)

**User Flow:**
```
Dashboard → Integrations → Discord → "Connect Discord"
→ Shows step-by-step guide with screenshots
→ User pastes bot token
→ "Connect" → Gateway restarts → Status: Online ✅
```

### 2. 📱 Telegram Integration UI (P0) — ~4h

**Why:** Even simpler than Discord. Very popular for bots.

**Implementation:**
1. Same "Integrations" tab
2. Simpler flow:
   - Link to BotFather
   - "Create bot, copy token, paste here"
3. Config update:
   ```json
   {
     "channels": {
       "telegram": {
         "enabled": true,
         "token": "user-provided-token"
       }
     }
   }
   ```

### 3. 🌐 Browser Automation (P0) — ~6h

**Why:** Without this, agents can't actually DO things on the web.

**Options:**

**Option A: Browserbase (Recommended)**
- Cloud browser service
- Per-user contexts (persistent logins)
- $20/mo for 100 browser hours
- Already documented in SPEC

**Option B: Local Browser in Container**
- Run headless Chrome in Fly container
- Heavier resources needed (more RAM)
- Cheaper but more complex

**Implementation (Browserbase):**
1. Create Browserbase account for Automna
2. On user provision, create context for user
3. Store contextId in Turso
4. Update OpenClaw config with Browserbase credentials
5. Users can then say "browse to X" and it works

### 4. ⚙️ Agent Configuration UI (P1) — ~4h

**Why:** Users want to customize their agent.

**Features:**
- Model selection (Opus vs Sonnet vs Haiku)
- System prompt / SOUL.md editing
- Agent name
- Timezone
- Memory settings (on/off)

**Implementation:**
1. "Settings" tab in dashboard
2. Form fields for each option
3. API endpoint to update OpenClaw config
4. Gateway restart to apply

### 5. 👋 Onboarding Flow (P1) — ~3h

**Why:** First impression matters. Users don't know what's possible.

**Features:**
- Welcome message from agent on first login
- "What can I do?" examples:
  - "Research and summarize any topic"
  - "Help you write and edit documents"
  - "Search the web and fetch pages"
  - "Remember our conversations"
  - "Connect to Discord/Telegram"
- Quick-start prompts (clickable)

**Implementation:**
1. Check if first session
2. If so, show onboarding modal or inject welcome message
3. Suggestion chips below input

---

## Production Hardening (Before Launch)

### Must Fix
- [ ] Switch Clerk to production keys
- [ ] Error boundaries in React
- [ ] Better error messages (not raw stack traces)
- [ ] Rate limiting on API routes

### Should Fix
- [ ] Usage monitoring (tokens, requests)
- [ ] Gateway health dashboard
- [ ] Log aggregation
- [ ] Automatic restart on crash

### Nice to Have
- [ ] Analytics (user engagement)
- [ ] Admin dashboard (all users)
- [ ] Backup/restore workspace

---

## Effort Summary

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Discord Integration | ~5h | HIGH — Key differentiator |
| P0 | Telegram Integration | ~4h | HIGH — Easy win |
| P0 | Browser Automation | ~6h | HIGH — Makes it "agentic" |
| P1 | Agent Configuration | ~4h | MEDIUM — Customization |
| P1 | Onboarding Flow | ~3h | MEDIUM — First impression |
| P1 | Production Hardening | ~8h | HIGH — Launch readiness |

**Total: ~30h for launch-ready state**

---

## Recommended Order

**This week:**
1. Discord Integration UI (highest value)
2. Telegram Integration UI (quick win)

**Next week:**
3. Browser Automation (Browserbase)
4. Agent Configuration UI
5. Onboarding Flow

**Before launch:**
6. Production Hardening
7. Switch to production Clerk/Stripe keys

---

## What's NOT Needed for MVP

- WhatsApp (complex setup, lower priority)
- Multiple agents per user
- Team features
- Mobile app
- Skill marketplace
- White-label

These are Phase 2/3 features per the SPEC.
