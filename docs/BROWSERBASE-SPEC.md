# Browserbase Integration Specification

**Date:** 2026-02-03  
**Status:** Planning  
**Priority:** P0 (Pro tier feature)

---

## Overview

Give each Automna agent a cloud browser powered by Browserbase. Agents can browse websites, fill forms, automate tasks, and maintain persistent logins.

**Value Proposition:** "Your agent can actually browse the web and do things for you."

---

## What is Browserbase?

Cloud browser service that provides:
- Real Chrome browsers in the cloud
- Persistent contexts (stay logged in across sessions)
- Built-in CAPTCHA solving
- Stealth mode (avoids bot detection)
- Playwright/Puppeteer compatible API

**Pricing (Jan 2026):**
| Plan | Cost | Browser Hours | Sessions |
|------|------|---------------|----------|
| Free | $0 | 1 hr | 1 |
| Developer | $20/mo | 100 hrs | 25 |
| Startup | $99/mo | 500 hrs | 100 |
| Scale | Custom | Usage-based | 250+ |

Overage: ~$0.10-0.12/browser hour

---

## Architecture

### Option A: Shared Browserbase Account (Recommended for MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Automna (Our Account)                         │
│                                                                 │
│  Browserbase Account (Startup plan: $99/mo, 500 hrs)            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Context: user_abc123    Context: user_def456    ...        ││
│  │  (Alex's logins)         (Bob's logins)                     ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────┐    ┌─────────────────────┐
│ automna-u-abc123    │    │ automna-u-def456    │
│ (Alex's agent)      │    │ (Bob's agent)       │
│                     │    │                     │
│ BROWSERBASE_        │    │ BROWSERBASE_        │
│ CONTEXT_ID=ctx_abc  │    │ CONTEXT_ID=ctx_def  │
└─────────────────────┘    └─────────────────────┘
```

**Pros:**
- Single account to manage
- Easy cost tracking
- Can pool unused hours across users

**Cons:**
- We pay upfront, hope users don't abuse
- Need usage monitoring

### Option B: Per-User Browserbase Accounts

Each user brings their own Browserbase API key.

**Pros:**
- No cost to us
- User controls their own usage

**Cons:**
- More setup friction
- Not "zero config" experience
- Users might not have Browserbase

### Recommendation: Option A for Pro Tier

- We provision a context per Pro user
- Include X hours/month in plan
- Overage charged or soft-limited

---

## Implementation Plan

### Phase 1: Provision Context on Upgrade (4h)

When user upgrades to Pro:
1. Create Browserbase context for user
2. Store contextId in Turso (`machines` table)
3. Add `BROWSERBASE_CONTEXT_ID` to user's Fly machine env

**API Endpoint:** `POST /api/user/browserbase/provision`

```typescript
// Create context for user
const response = await fetch('https://api.browserbase.com/v1/contexts', {
  method: 'POST',
  headers: {
    'X-BB-API-Key': process.env.BROWSERBASE_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    projectId: process.env.BROWSERBASE_PROJECT_ID,
  }),
});
const { id: contextId } = await response.json();

// Store in database
await db.update(machines)
  .set({ browserbaseContextId: contextId })
  .where(eq(machines.userId, userId));

// Update Fly machine env
await updateFlyMachineEnv(appName, machineId, {
  BROWSERBASE_CONTEXT_ID: contextId,
});
```

### Phase 2: Configure OpenClaw Browser (2h)

Update user's `clawdbot.json` to use Browserbase:

```json
{
  "browser": {
    "provider": "browserbase",
    "browserbase": {
      "apiKey": "${BROWSERBASE_API_KEY}",
      "projectId": "${BROWSERBASE_PROJECT_ID}",
      "contextId": "${BROWSERBASE_CONTEXT_ID}"
    }
  }
}
```

Or agent can self-configure via `gateway` tool.

### Phase 3: Usage Tracking (4h)

Track browser hours per user:
- Webhook from Browserbase on session end
- Or poll sessions API periodically
- Store in Turso for billing/limits

**Database schema:**
```sql
CREATE TABLE browser_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### Phase 4: Dashboard UI (3h)

Show in user dashboard:
- Browser status (enabled/disabled)
- Hours used this month
- Hours remaining
- Recent sessions

---

## OpenClaw Browser Integration

OpenClaw already has browser support! Commands:

```bash
clawdbot browser status
clawdbot browser start
clawdbot browser open https://example.com
clawdbot browser screenshot
clawdbot browser snapshot  # Get page state for AI
clawdbot browser click 12  # Click element by ref
clawdbot browser type 23 "hello"
clawdbot browser fill --fields '[{"ref":"1","value":"Ada"}]'
```

The agent can use the `browser` tool to:
- Navigate to URLs
- Take screenshots
- Get page snapshots (for understanding)
- Click, type, fill forms
- Download files
- Handle dialogs

**Example agent interaction:**
```
User: "Check my Google Analytics and tell me how traffic is doing"

Agent: *opens browser*
Agent: *navigates to analytics.google.com*
Agent: *takes snapshot*
Agent: "I can see your dashboard. Traffic is up 15% this week..."
```

---

## Persistent Logins (Contexts)

Browserbase contexts preserve:
- Cookies
- localStorage
- sessionStorage
- Auth tokens

**Flow:**
1. First time: Agent navigates to site, user logs in manually (or agent does)
2. Context saves the session
3. Next time: Agent opens browser, already logged in

**Security consideration:** User must trust their agent with access to their accounts. This is part of the value prop - "your agent can act as you."

---

## Cost Analysis

**Assumptions:**
- 100 Pro users
- Average 5 browser hours/user/month
- Total: 500 hours/month

**Browserbase cost:**
- Startup plan: $99/mo for 500 hours
- Per-user cost: ~$1/mo

**Pricing:**
- Pro tier: $149/mo
- Browser feature adds ~$1 cost
- Plenty of margin

**Risk mitigation:**
- Soft limit at 10 hrs/user/month
- Alert on heavy users
- Can upgrade to Scale plan if needed

---

## User Experience

### Pro User Enables Browser

```
User: "Can you check my website's uptime?"

Agent: "I'd need browser access to do that. As a Pro user, 
       you have browser capabilities! Let me enable it...
       
       *uses gateway tool to configure browser*
       
       Done! I now have a browser. Let me check your site..."
```

### Agent Uses Browser

```
User: "Fill out this job application for me"

Agent: *opens browser*
Agent: *navigates to application URL*
Agent: *takes snapshot to understand form*
Agent: *fills fields based on user's resume in workspace*
Agent: "I've filled out the application. Here's a screenshot 
       for you to review before I submit:"
       MEDIA:/home/node/.openclaw/workspace/screenshots/app.png
```

### First-Time Login

```
User: "Post this to my Twitter"

Agent: *opens browser, goes to twitter.com*
Agent: "I'm not logged into Twitter yet. Could you log in for me?
       I'll keep the session saved for next time.
       
       Opening browser... you should see a login page."
       
       [User logs in via some mechanism - TBD]

Agent: "Great, I'm logged in! Posting your tweet now..."
```

---

## Security Considerations

1. **Context isolation:** Each user has separate Browserbase context
2. **No cross-user access:** Contexts are tied to user ID
3. **User consent:** User explicitly enables browser features
4. **Audit trail:** Log all browser sessions
5. **Credential handling:** Agent doesn't see raw passwords (browser handles auth)

---

## Implementation Checklist

### Backend
- [ ] Add `browserbaseContextId` to machines table
- [ ] Create `/api/user/browserbase/provision` endpoint
- [ ] Create `/api/user/browserbase/usage` endpoint
- [ ] Add Browserbase webhook handler for usage tracking
- [ ] Add BROWSERBASE_API_KEY to Vercel env
- [ ] Add BROWSERBASE_PROJECT_ID to Vercel env

### Docker/Config
- [ ] Update default config to support browser when env vars present
- [ ] Add browser instructions to AGENTS.md
- [ ] Add browser section to TOOLS.md template

### Dashboard UI
- [ ] Add browser status to settings page
- [ ] Show usage meter
- [ ] Enable/disable toggle (or auto-enable for Pro)

### Testing
- [ ] Test context creation
- [ ] Test browser session from agent
- [ ] Test persistent login
- [ ] Test usage tracking
- [ ] Test soft limits

---

## Timeline

| Phase | Effort | Description |
|-------|--------|-------------|
| 1. Context provisioning | 4h | Create context on Pro upgrade |
| 2. OpenClaw config | 2h | Configure browser in agent |
| 3. Usage tracking | 4h | Track hours, store in DB |
| 4. Dashboard UI | 3h | Show status and usage |
| **Total** | **13h** | ~2 days |

---

## Open Questions

1. **How do users log into sites?**
   - Option A: Agent walks them through (type your password)
   - Option B: We expose browser UI temporarily
   - Option C: User pre-configures OAuth tokens
   
2. **What about 2FA?**
   - Agent would need to ask user for codes
   - Or user uses passkeys/biometrics (harder)

3. **Rate limiting?**
   - Soft limit at X hours/month
   - Warning at 80%
   - Block or charge overage?

4. **Free tier access?**
   - Maybe 1 hour free to try?
   - Or Pro-only?

---

## References

- Browserbase docs: https://docs.browserbase.com
- Browserbase contexts: https://docs.browserbase.com/features/contexts
- OpenClaw browser tool: `clawdbot browser --help`
- SPEC.md browser section (existing notes)
