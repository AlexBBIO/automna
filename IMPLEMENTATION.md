# Automna Implementation Plan

**Last Updated:** 2026-01-29 03:07 UTC  
**Status:** Phase 1 Complete, Phase 2 In Progress (Setup Wizard Done)

---

## Current Progress

### ✅ Completed (Phase 1)
- [x] Domain: automna.ai (Cloudflare DNS)
- [x] Cloudflare: API token configured (`config/cloudflare.json`)
- [x] Landing page: automna.ai (Vercel + Next.js)
- [x] Moltbot migration page: automna.ai/clawd (with lobster mascot)
- [x] Pricing page: automna.ai/pricing
- [x] Email waitlist: Loops.so integration
- [x] Email inbox: automnajoi@agentmail.to (Agentmail)
- [x] Browser automation: Browserbase account + API
- [x] Stealth browser: Playwright + residential proxy (Smartproxy)
- [x] GitHub repo: github.com/AlexBBIO/automna
- [x] **Authentication: Clerk** (sign-in, sign-up, protected routes)
- [x] **Payments: Stripe** (3 tiers, checkout, webhooks)
- [x] **Billing Portal: Stripe Customer Portal** (manage subscription in user dropdown)
- [x] **Dashboard: /dashboard** (authenticated, shows plan status)

### 🔄 In Progress (Phase 3 - Infrastructure)
- [x] Database: Neon Postgres setup ✅
- [x] Prisma schema (User, Agent models) ✅
- [x] Setup wizard UI (`/dashboard/setup`) ✅
- [x] API key validation endpoint ✅
- [x] Encrypted storage for API keys ✅
- [ ] Container provisioning (Hetzner + Docker)
- [ ] Clawdbot config generation + injection
- [ ] Cloudflare Tunnel setup for agent subdomains
- [ ] Agent deployment endpoint (actually spin up Clawdbot)

### ⚠️ Known Gaps (Non-Blocking)
| Gap | Status | Notes |
|-----|--------|-------|
| Browserbase context not created on signup | Deferred | Will create on-demand when agent first needs browser |
| User DB record only on deploy | Acceptable | Users must complete setup anyway; stub record not needed |
| No `customer.subscription.created` Stripe event | Acceptable | `checkout.session.completed` covers new subscriptions |
| Account deletion cleanup | TODO | Need to clean up Browserbase context, cancel Stripe, delete agent |
| Password reset flow | Handled by Clerk | Built-in, no custom work needed |
| Email verification | Handled by Clerk | Built-in, no custom work needed |


---

## Phase 1: Infrastructure Foundation (Week 1-2)

### 1.1 Core Services Setup

| Service | Purpose | Status | Config Location |
|---------|---------|--------|-----------------|
| Cloudflare | DNS, SSL, DDoS, Tunnels | ✅ Done | config/cloudflare.json |
| Vercel | Landing page hosting | ✅ Done | automna project |
| Loops.so | Email marketing/waitlist | ✅ Done | config/loops.json |
| Agentmail | Transactional email | ✅ Done | config/agentmail.json |
| Browserbase | Cloud browser sessions | ✅ Done | config/browserbase.json |
| Clerk | Authentication | ✅ Done | config/clerk.json |
| Stripe | Payments | ✅ Done | config/stripe.json |
| Neon | Database | ✅ Done | Vercel env vars |
| Hetzner | Agent hosting | 🔲 TODO | - |

### 1.2 Authentication System ✅ COMPLETE

**Choice:** Clerk

**Implemented:**
- [x] Clerk account created
- [x] Keys added to Vercel environment
- [x] Sign-in page: `/sign-in` (dark themed)
- [x] Sign-up page: `/sign-up` (dark themed)
- [x] Middleware protecting `/dashboard/*` routes
- [x] User metadata stores plan + Stripe customer ID
- [x] Clerk webhook → Loops.so (sync signups for email comms)

**Clerk Webhook Setup:**
1. Go to Clerk Dashboard → Webhooks
2. Add endpoint: `https://automna.ai/api/webhooks/clerk`
3. Select events: `user.created`, `user.updated`, `user.deleted`
4. Copy signing secret → add to Vercel as `CLERK_WEBHOOK_SECRET`

### 1.3 Database

**Choice: Neon (Serverless Postgres)**
- Free tier: 0.5GB storage, autoscaling
- Works great with Vercel
- Can migrate to Hetzner-hosted Postgres later

**Schema (Initial):**
```sql
-- Users (extends Clerk)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'free',
  anthropic_key_encrypted TEXT,
  browserbase_context_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'stopped',
  container_id VARCHAR(255),
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Integrations
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  type VARCHAR(50) NOT NULL, -- discord, telegram, whatsapp
  config_encrypted TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Tasks:**
- [x] Create Neon account ✅
- [x] Set up database ✅
- [x] Create Prisma schema ✅
- [x] Add to Vercel environment ✅
- [x] Run migrations ✅

### 1.4 Stripe Integration

**Products:**
| Plan | Price ID | Features |
|------|----------|----------|
| Starter | price_starter_79 | 1 agent, web + 1 integration |
| Pro | price_pro_149 | 1 agent, all integrations, app hosting |
| Business | price_business_299 | 3 agents, team features |

**Implementation:**
- [ ] Create Stripe account
- [ ] Create products and prices
- [ ] Implement checkout session API
- [ ] Set up webhooks for payment events
- [ ] Handle subscription lifecycle (create, update, cancel)
- [ ] Customer portal for billing management

---

## Phase 2: Dashboard & User Experience (Week 2-3)

### 2.1 Dashboard Pages

```
/dashboard
├── / (overview - agent status, quick actions)
├── /agent (agent management)
│   ├── /setup (first-time setup wizard)
│   ├── /settings (configuration)
│   └── /chat (web chat interface)
├── /integrations
│   ├── /discord
│   ├── /telegram
│   └── /whatsapp
├── /billing
│   └── Stripe customer portal redirect
└── /account
    └── Profile, API key management
```

### 2.2 Setup Wizard Flow

```
Step 1: API Key
├── Explain what it is
├── Link to Anthropic console
├── Input field with validation
├── Test API key before saving
└── Encrypt and store

Step 2: Name Your Agent
├── Name input
├── Optional: Personality prompt
├── Avatar selection (or upload)
└── Preview of agent greeting

Step 3: Choose Plan
├── Show tier comparison
├── Stripe checkout redirect
└── Or start free trial

Step 4: First Integration
├── Web chat (always on)
├── Optional: Discord setup guide
├── Optional: Telegram setup guide
└── Skip for now option

Step 5: Deploy
├── Show deployment progress
├── Container provisioning
├── Health check
└── "Your agent is live!" 🎉
```

### 2.3 Setup Wizard ✅ IMPLEMENTED

**Location:** `/dashboard/setup`

**Flow:**
```
Step 1: API Key
├── User enters Anthropic API key (sk-ant-...)
├── Validated via test API call to Anthropic
└── Encrypted with AES-256-CBC, stored in Neon

Step 2: Agent Basics
├── Agent name (required)
├── Personality/system prompt (optional)
└── Timezone selection

Step 3: Integrations
├── Web Chat: Always enabled
├── Discord: Optional bot token
└── Telegram: Optional bot token

Step 4: Deploy
├── Summary of configuration
├── Creates User + Agent records in DB
├── Generates Clawdbot config template
└── Status: "pending" (awaiting container infrastructure)
```

**API Routes:**
- `POST /api/setup/validate-key` - Tests Anthropic API key
- `POST /api/setup/deploy` - Saves config, creates agent record

**Security:**
- API keys encrypted with AES-256-CBC
- Encryption key stored in Vercel env (ENCRYPTION_KEY)
- Tokens never logged or exposed

### 2.4 Agent Chat Interface

**Requirements:**
- Real-time messaging (WebSocket or SSE)
- Message history persistence
- File upload support
- Code block rendering
- Mobile responsive

**Implementation Options:**
1. **Build custom** - Full control, more work
2. **Use Clawdbot web UI** - iframe or redirect
3. **Vercel AI SDK** - Good for streaming responses

**Recommendation:** Start with Clawdbot's built-in web UI (proxy through our domain), add custom features later.

---

## Phase 3: Agent Infrastructure (Week 3-4)

### 3.1 Container/VM Architecture

**Tier-Based Resource Allocation:**

| Tier | Type | Memory | CPU | Storage | Monthly Infra |
|------|------|--------|-----|---------|---------------|
| Starter $29 | Shared container | 2.5GB | 1 core | 5GB | ~$5 |
| Pro $79 | Shared container | 4GB | 1.5 cores | 10GB | ~$9 |
| Business $129 | Dedicated VM | 8GB | 4 cores | 40GB | ~$14 (CX32) |
| Max $249 | Dedicated VM | 16GB | 8 cores | 80GB | ~$27 (CX42) |

**Shared tiers:** Containers on multi-tenant CX52 (32GB) servers
**Dedicated tiers:** Own Hetzner cloud VM per user

**Base Dockerfile:**
```dockerfile
FROM node:22-slim

# Install Clawdbot
RUN npm install -g clawdbot

# Create workspace
WORKDIR /root/clawd

# Copy base config
COPY base-config.yaml /root/.clawdbot/clawdbot.yaml

# Health check
HEALTHCHECK --interval=30s --timeout=10s \
  CMD curl -f http://localhost:3000/health || exit 1

# Start gateway
CMD ["clawdbot", "gateway", "start", "--foreground"]
```

**Container resource limits (shared tiers):**
```yaml
# Starter
mem_limit: 2560m
cpus: 1.0

# Pro  
mem_limit: 4096m
cpus: 1.5
```

### 3.2 Provisioning Flow

```
1. User completes setup wizard
2. API call to provisioner service
3. Provisioner:
   a. Creates Docker volume for user data
   b. Generates Clawdbot config with user's API key
   c. Starts container with resource limits
   d. Sets up Cloudflare Tunnel for user subdomain
   e. Runs health check
   f. Updates database with container ID
4. Return success + chat URL to dashboard
```

### 3.3 Orchestration

**Initial (< 50 shared users): Single Server + Docker Compose**
- Hetzner CX52 (32GB RAM)
- ~10 Starter (2.5GB) or ~7 Pro (4GB) containers
- Simple, easy to manage

**Growth (50-200 shared users): Docker Swarm**
- Multiple CX52 servers
- Automatic container placement
- Built-in load balancing

**Dedicated tiers (Business/Max):** 
- Each user gets own Hetzner VM (CX32/CX42)
- Provisioned via Hetzner API on signup
- Full isolation, no sharing

**Scale (500+ users): Kubernetes**
- Complex but necessary at scale
- Consider managed K8s (Hetzner doesn't have it, may need GKE/EKS)

### 3.4 Cloudflare Tunnels

Each agent gets a subdomain: `{username}.automna.ai`

**Implementation:**
- Run `cloudflared` daemon on host
- Create tunnel per user OR single tunnel with routing rules
- Ingress rules route `username.automna.ai` → container port

**Config example:**
```yaml
tunnel: automna-agents
credentials-file: /etc/cloudflared/creds.json

ingress:
  - hostname: alex.automna.ai
    service: http://agent_alex:3000
  - hostname: bob.automna.ai
    service: http://agent_bob:3000
  - service: http_status:404
```

---

## Phase 4: Integrations (Week 4-5)

### 4.1 Discord

**User Flow:**
1. User clicks "Connect Discord"
2. Show guide: "Create Discord bot, copy token"
3. User pastes bot token
4. We validate token, get bot info
5. Show "Add to Server" OAuth link
6. User adds bot to their server
7. Test message sent

**Technical:**
- Store encrypted bot token
- Inject into Clawdbot config
- Clawdbot handles Discord connection

### 4.2 Telegram

**User Flow:**
1. User clicks "Connect Telegram"
2. Show guide: "Message @BotFather, create bot"
3. User pastes bot token
4. We validate, get bot username
5. Test message: User sends /start

**Technical:**
- Store encrypted bot token
- Inject into Clawdbot config
- Webhook vs polling (polling is simpler for MVP)

### 4.3 WhatsApp (Phase 2+)

**Options:**
1. **WhatsApp Business API** - Official, $$$, slow approval
2. **WhatsApp Web bridge** - Gray area, may break
3. **Third-party (Twilio)** - Easier, $0.005-0.08/message

**Recommendation:** Skip for MVP, add in Phase 2 with Twilio.

---

## Phase 5: Browser Capabilities (Week 5-6)

### 5.1 Browserbase Integration

**Already set up!** Key: `bb_live_s9B_unk_rqm4l_7H3VCDP59-Tw0`

**Per-User Flow:**
1. Create Browserbase context on user signup
2. Store `contextId` in database
3. Agent uses context for all browser sessions
4. Sessions persist cookies/auth across tasks

**Clawdbot Skill:**
```javascript
// Browser skill for Clawdbot
async function browserOpen(url, options = {}) {
  const session = await browserbase.sessions.create({
    projectId: PROJECT_ID,
    browserSettings: {
      context: { id: user.browserbaseContextId }
    }
  });
  // Connect Playwright, navigate, return page
}
```

### 5.2 Stealth Browser (Fallback)

For sites that block Browserbase:
- Smartproxy residential proxy (already configured)
- Playwright with stealth patches
- Running on our server (not in user containers)

---

## Phase 6: Email Capabilities (Week 6)

### 6.1 Per-User Email

**Option A: Agentmail subdomain**
- `{username}@agents.automna.ai`
- We manage, users receive/send through agent
- Clean, professional

**Option B: User's own email**
- OAuth connection to Gmail/Outlook
- More setup, but familiar to users
- Privacy concerns

**Recommendation:** Start with Option A (Agentmail subdomain).

### 6.2 Implementation

```
1. User signs up
2. Create Agentmail inbox: {username}@agents.automna.ai
3. Store credentials in user record
4. Configure Clawdbot with email skill
5. Agent can send/receive email
```

---

## Phase 7: Launch Checklist

### Pre-Launch (Week 6)
- [ ] **Clerk: Switch to Production Mode**
  - Toggle to Production in Clerk Dashboard
  - Get live keys (`pk_live_`, `sk_live_`)
  - Update Vercel env vars (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY)
  - Re-add webhook endpoint for production instance
  - Update CLERK_WEBHOOK_SECRET with new signing secret
- [ ] **Stripe: Switch to Live Mode**
  - Get live keys from Stripe Dashboard
  - Update Vercel env vars (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  - Create live webhook endpoint, update STRIPE_WEBHOOK_SECRET
  - Create live price IDs, update NEXT_PUBLIC_STRIPE_PRICE_* vars
- [ ] Security audit
- [ ] Load testing (50 concurrent agents)
- [ ] Documentation (user guides)
- [ ] Support system (Discord + email)
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Monitoring & alerting (Uptime Kuma)
- [ ] Backup system (daily snapshots)

### Launch Day
- [ ] Email waitlist (beta invites)
- [ ] Reddit posts (r/ClaudeAI, r/SideProject)
- [ ] Hacker News (Show HN)
- [ ] Twitter announcement
- [ ] Product Hunt (schedule)

### Post-Launch (Week 7-8)
- [ ] Monitor signups and conversions
- [ ] Collect user feedback
- [ ] Fix critical bugs
- [ ] Iterate on UX pain points
- [ ] Scale infrastructure as needed

---

## Cost Projections

### Fixed Costs (Monthly)

| Service | Cost | Notes |
|---------|------|-------|
| Hetzner CX32 | $15 | Scales with users |
| Cloudflare | $0 | Free tier sufficient |
| Vercel | $0 | Free tier for now |
| Neon | $0 | Free tier (0.5GB) |
| Clerk | $0 | Free tier (10k MAU), then $0.02/MAU |
| Loops | $0 | Free tier (1k contacts) |
| Agentmail | $0 | Free tier |
| Browserbase | $20 | Developer plan |
| Smartproxy | $30 | Residential, if needed |
| **Total** | **$65** | Before users |

### Variable Costs (Per Tier)

| Tier | Price | Infra | Credits* | Total Cost | Margin |
|------|-------|-------|----------|------------|--------|
| Starter $29 | $29 | ~$5 | — | ~$5 | 83% |
| Pro $79 | $79 | ~$9 | — | ~$9 | 89% |
| Business $129 | $129 | ~$14 | ~$15 | ~$29 | 78% |
| Max $249 | $249 | ~$27 | ~$40 | ~$67 | 73% |

*Credit costs assume average usage. BYOK tiers (Starter/Pro) have minimal credit costs (browser/extras only).

### Automna Credits System

Credits are a universal currency covering all platform usage:

| Resource | Credits |
|----------|---------|
| 1 AI message (Sonnet) | 1 |
| 1 AI message (Opus/extended) | 5 |
| 1 min browser automation | 2 |
| 100MB storage (monthly) | 10 |
| 1 scheduled task run | 1 |
| 1 email sent | 1 |

**Included credits by tier:**
- Starter: 500/mo (covers browser/extras, AI is BYOK)
- Pro: 2,000/mo (covers browser/extras, AI is BYOK)
- Business: 15,000/mo (covers everything)
- Max: 40,000/mo (covers everything)

**Overage:** $10 per 1,000 credits ($0.01/credit)

### Break-Even Analysis

At $29/mo Starter plan:
- Gross margin: ~83% ($24)
- Fixed costs ($65) covered at: 3 paying users
- Profitable at: 10+ users

---

## Technical Decisions Log

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| Hosting | Vercel + Hetzner | Landing on Vercel (free), agents on Hetzner (cheap) | 2026-01-28 |
| Database | Neon Postgres | Serverless, free tier, Vercel integration | 2026-01-29 |
| Auth | Clerk | Fast implementation, good UX (currently dev mode) | 2026-01-29 |
| Payments | Stripe | Industry standard, reliable (currently test mode) | 2026-01-29 |
| Email marketing | Loops.so | Modern, good API, free tier | 2026-01-29 |
| Transactional email | Agentmail | Built for AI agents, simple API | 2026-01-28 |
| Browser | Browserbase | Persistent contexts, stealth, managed | 2026-01-28 |
| Container orchestration | Docker Compose → Swarm | Simple first, scale later | 2026-01-29 |

---

## Next Actions (This Week)

### ✅ Completed
1. [x] Set up Stripe account and products ✅
2. [x] Implement Clerk authentication ✅
3. [x] Build basic dashboard layout ✅
4. [x] Set up Neon database with Prisma ✅
5. [x] User API key storage (encrypted) ✅
6. [x] Build setup wizard (API key + agent name + integrations) ✅
7. [x] API key validation endpoint ✅

### Priority 1 (Must Do Next)
1. [ ] Create Dockerfile for Clawdbot agent containers
2. [ ] Set up Docker on Hetzner server (or use existing)
3. [ ] Build provisioning API endpoint (`/api/agent/deploy`)
4. [ ] Cloudflare Tunnel config for `{username}.automna.ai`
5. [ ] Connect setup wizard "Deploy" step to actual container spin-up

### Priority 2 (Should Do)
6. [ ] Agent status monitoring (is container running?)
7. [ ] Dashboard shows real agent status, not placeholder
8. [ ] Test end-to-end: signup → setup → deploy → chat works

### Priority 3 (Nice to Have)
9. [ ] Discord integration guide in setup wizard
10. [ ] Telegram integration guide in setup wizard
11. [ ] Documentation site

---

## File Locations

```
/root/clawd/projects/automna/
├── SPEC.md              # Product specification
├── IMPLEMENTATION.md    # This file
├── landing/             # Next.js app (Vercel)
│   ├── src/app/
│   │   ├── page.tsx           # Main landing
│   │   ├── clawd/             # Moltbot migration page
│   │   ├── pricing/           # Pricing page
│   │   ├── dashboard/         # User dashboard
│   │   ├── sign-in/           # Clerk sign-in
│   │   ├── sign-up/           # Clerk sign-up
│   │   └── api/
│   │       ├── waitlist/      # Loops.so integration
│   │       ├── checkout/      # Stripe checkout
│   │       ├── billing/portal # Stripe customer portal
│   │       └── webhooks/stripe # Stripe webhooks
│   └── public/
│       └── lobster-mascot.png # Clawdbot mascot
├── config/              # Service credentials (chmod 600)
│   ├── cloudflare.json
│   ├── clerk.json
│   ├── stripe.json
│   ├── loops.json
│   ├── agentmail.json
│   └── browserbase.json
├── provisioner/         # (TODO) Container provisioning service
└── config/              # Service credentials
    ├── loops.json
    ├── agentmail.json
    ├── browserbase.json
    └── vercel.json
```

---

*This is a living document. Update as decisions are made and progress happens.*
