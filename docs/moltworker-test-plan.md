# Moltworker Test Plan

**Date:** 2026-01-29  
**Status:** Planning  
**Goal:** Validate Cloudflare Moltworker as infrastructure for Automna

---

## Overview

Cloudflare released [Moltworker](https://github.com/cloudflare/moltworker) — a way to run Clawdbot (which they call "Moltbot") on their serverless platform using Sandbox SDK, Browser Rendering, R2 storage, and AI Gateway.

This could replace our Docker-based container orchestration with a fully managed solution.

---

## What We're Testing

### Core Questions

1. **Does it work?** Can we deploy and chat with a Clawdbot instance?
2. **Feature parity?** Do all key Clawdbot features work (memory, tools, integrations)?
3. **Cold start acceptable?** Is 1-2 minute startup tolerable for our use case?
4. **Cost viable?** What's the actual cost per user at various usage levels?
5. **Multi-tenant ready?** Can we run isolated instances per user?

### Success Criteria

| Test | Pass Criteria |
|------|---------------|
| Basic deployment | Instance deploys, webchat loads |
| Chat functionality | Can send messages, get responses |
| Persistence | Conversation survives container restart |
| Browser automation | Can navigate web, take screenshots |
| Cold start time | Under 2 minutes from sleep |
| Multi-user isolation | Two sandbox IDs = two isolated instances |

---

## Prerequisites

### Cloudflare Account Setup

- [ ] Workers Paid plan ($5/mo) — required for Sandbox SDK
- [ ] Create R2 bucket for persistence
- [ ] Create AI Gateway instance
- [ ] Set up Zero Trust Access (or use gateway token for testing)

### API Keys Needed

- [ ] Anthropic API key (or use AI Gateway unified billing)
- [ ] Cloudflare API token with Workers/R2/Access permissions

### Local Environment

- [ ] Node.js 18+
- [ ] Wrangler CLI (`npm install -g wrangler`)
- [ ] Git

---

## Phase 1: Basic Deployment (Day 1)

### Step 1.1: Fork and Clone

```bash
# Fork to our org first (GitHub UI), then:
cd /root/clawd/projects/automna
git clone https://github.com/automna/moltworker.git
cd moltworker
npm install
```

### Step 1.2: Configure Secrets

```bash
# Anthropic API key
npx wrangler secret put ANTHROPIC_API_KEY

# Gateway token (generate random)
export MOLTBOT_GATEWAY_TOKEN=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)
echo "Token: $MOLTBOT_GATEWAY_TOKEN"
echo "$MOLTBOT_GATEWAY_TOKEN" | npx wrangler secret put MOLTBOT_GATEWAY_TOKEN
```

### Step 1.3: Deploy

```bash
npm run deploy
```

### Step 1.4: Test Basic Access

```
https://moltworker.{account}.workers.dev/?token={GATEWAY_TOKEN}
```

**Expected:** Loading page (1-2 min), then webchat UI

### Step 1.5: Validate Chat

- Send a test message
- Verify response
- Check conversation appears in history

**Document:** 
- Actual cold start time: _____ seconds
- Any errors: _____

---

## Phase 2: Persistence Testing (Day 1-2)

### Step 2.1: Enable R2 Storage

```bash
# Create R2 API token in Cloudflare dashboard
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put CF_ACCOUNT_ID

npm run deploy
```

### Step 2.2: Test Persistence

1. Chat with agent, establish context ("My name is Alex, remember this")
2. Wait for backup (5 min) or trigger manual backup via `/_admin/`
3. Restart container via admin UI
4. Chat again — does it remember?

**Document:**
- Backup frequency: _____
- Restore time: _____
- Data retained: [ ] Yes [ ] No

### Step 2.3: Test Container Sleep/Wake

```bash
# Set sleep timeout
npx wrangler secret put SANDBOX_SLEEP_AFTER
# Enter: 5m (for testing)

npm run deploy
```

1. Chat, establish context
2. Wait 6+ minutes (container sleeps)
3. Send new message
4. Measure cold start time
5. Verify context retained

**Document:**
- Sleep → Wake time: _____ seconds
- Context retained: [ ] Yes [ ] No

---

## Phase 3: Feature Testing (Day 2)

### Step 3.1: Browser Automation

Test if Browser Rendering works through the CDP shim:

1. Ask agent to screenshot a website
2. Ask agent to navigate and extract data

**Document:**
- Browser works: [ ] Yes [ ] No
- Screenshot capability: [ ] Yes [ ] No
- Page navigation: [ ] Yes [ ] No

### Step 3.2: File Operations

1. Ask agent to create a file
2. Ask agent to read it back
3. Restart container
4. Verify file persists

**Document:**
- File creation: [ ] Yes [ ] No
- File persistence: [ ] Yes [ ] No

### Step 3.3: External Integrations (Optional)

If time permits, test Discord/Telegram integration:

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
npm run deploy
```

**Document:**
- Discord works: [ ] Yes [ ] No [ ] Not tested
- Telegram works: [ ] Yes [ ] No [ ] Not tested

---

## Phase 4: Multi-Tenant Testing (Day 3)

### Step 4.1: Understand Sandbox Isolation

The key line in Moltworker:
```typescript
const sandbox = getSandbox(env.Sandbox, 'moltbot');
```

For multi-tenant, we'd change to:
```typescript
const sandbox = getSandbox(env.Sandbox, `user-${userId}`);
```

### Step 4.2: Create Test Fork with User Isolation

Modify `src/index.ts` to accept user ID:

```typescript
// Extract user from path or header
const userId = extractUserId(request); // e.g., from /u/{userId}/...
const sandbox = getSandbox(env.Sandbox, `user-${userId}`);
```

### Step 4.3: Test Isolation

1. Access as user-A, send message "I am Alice"
2. Access as user-B, send message "I am Bob"
3. Verify user-A doesn't see Bob's messages
4. Verify separate R2 storage paths

**Document:**
- Isolation works: [ ] Yes [ ] No
- Separate storage: [ ] Yes [ ] No

---

## Phase 5: Cost Analysis (Day 3)

### Step 5.1: Monitor Usage

After running tests, check Cloudflare dashboard:

- Workers requests: _____
- Sandbox compute time: _____
- R2 storage: _____
- R2 operations: _____
- Browser Rendering minutes: _____

### Step 5.2: Calculate Per-User Cost

Based on usage patterns, estimate:

| Usage Level | Compute | Storage | Browser | Total/User/Mo |
|-------------|---------|---------|---------|---------------|
| Light (1hr/day active) | $ | $ | $ | $ |
| Moderate (4hr/day active) | $ | $ | $ | $ |
| Heavy (8hr/day active) | $ | $ | $ | $ |
| Always-on (no sleep) | $ | $ | $ | $ |

### Step 5.3: Compare to Current Approach

| Approach | 10 Users | 50 Users | 100 Users |
|----------|----------|----------|-----------|
| Hetzner Docker | €35/mo | €70/mo | €150/mo |
| Cloudflare Moltworker | $ | $ | $ |

---

## Phase 6: Integration Planning (Day 4)

If tests pass, plan dashboard integration:

### Architecture Options

**Option A: Replace Backend Entirely**
```
automna.ai (Vercel)
    → Clerk auth
    → Calls Moltworker API with userId
    → Moltworker creates sandbox per user
```

**Option B: Hybrid**
- Free/Starter tier: Cloudflare (allows cold starts)
- Pro/Business: Dedicated Docker (always-on)

### Required Dashboard Changes

1. Remove container provisioning code
2. Add Cloudflare Worker deployment
3. Store user ↔ sandbox mapping
4. Update proxy to route to Worker

---

## Decision Criteria

### GO if:
- [ ] Core features work (chat, memory, persistence)
- [ ] Cold start ≤ 2 minutes
- [ ] Cost is comparable or better than Docker at scale
- [ ] Multi-tenant isolation is solid
- [ ] No blocking bugs or limitations

### NO-GO if:
- [ ] Critical features don't work
- [ ] Cold start > 3 minutes
- [ ] Cost 2x+ higher than Docker
- [ ] Security/isolation concerns
- [ ] Too many workarounds needed

---

## Timeline

| Day | Focus | Deliverable |
|-----|-------|-------------|
| 1 | Setup + Basic Deploy | Working instance, initial impressions |
| 2 | Persistence + Features | Feature compatibility report |
| 3 | Multi-tenant + Cost | Isolation test, cost analysis |
| 4 | Decision + Planning | GO/NO-GO decision, integration plan |

---

## Notes

*(Fill in during testing)*

### Day 1 Notes
```

```

### Day 2 Notes
```

```

### Day 3 Notes
```

```

### Day 4 Notes
```

```

---

## Final Recommendation

*(To be filled after testing)*

**Decision:** [ ] GO [ ] NO-GO [ ] NEEDS MORE TESTING

**Reasoning:**


**Next Steps:**

