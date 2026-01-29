# Automna Implementation Plan

**Last Updated:** 2026-01-29  
**Status:** Phase 1 In Progress

---

## Current Progress

### ✅ Completed
- [x] Domain: automna.ai (Cloudflare DNS)
- [x] Landing page: automna.ai (Vercel + Next.js)
- [x] Clawdbot migration page: automna.ai/clawd
- [x] Email waitlist: Loops.so integration
- [x] Email inbox: automnajoi@agentmail.to (Agentmail)
- [x] Browser automation: Browserbase account + API
- [x] Stealth browser: Playwright + residential proxy (Smartproxy)
- [x] GitHub repo: github.com/AlexBBIO/automna
- [x] - [x] DNS verification for custom sending domain (mail.automna.ai)

### 🔄 In Progress


---

## Phase 1: Infrastructure Foundation (Week 1-2)

### 1.1 Core Services Setup

| Service | Purpose | Status | Config Location |
|---------|---------|--------|-----------------|
| Cloudflare | DNS, SSL, DDoS, Tunnels | ✅ Done | automna.ai zone |
| Vercel | Landing page hosting | ✅ Done | automna project |
| Loops.so | Email marketing/waitlist | ✅ Done | config/loops.json |
| Agentmail | Transactional email | ✅ Done | config/agentmail.json |
| Browserbase | Cloud browser sessions | ✅ Done | config/browserbase.json |
| Stripe | Payments | 🔲 TODO | - |
| Hetzner | Agent hosting | 🔲 TODO | - |

### 1.2 Authentication System

**Option A: Clerk (Recommended)**
- Pros: Pre-built UI, social auth, good Next.js integration
- Cons: $25/mo after 10k MAU
- Implementation: 1-2 days

**Option B: Auth.js (NextAuth)**
- Pros: Free, flexible, self-hosted
- Cons: More implementation work
- Implementation: 3-4 days

**Decision:** Use Clerk for MVP (faster), can migrate later.

**Tasks:**
- [ ] Create Clerk account
- [ ] Add to Vercel environment
- [ ] Implement auth pages (sign-up, sign-in)
- [ ] Protect dashboard routes
- [ ] Store user metadata (plan, API key encrypted)

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
- [ ] Create Neon account
- [ ] Set up database
- [ ] Create Prisma schema
- [ ] Add to Vercel environment
- [ ] Run migrations

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

### 2.3 Agent Chat Interface

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

### 3.1 Container Architecture

**Per-User Container:**
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

**Resource Limits:**
- Memory: 512MB (soft), 768MB (hard)
- CPU: 0.5 cores
- Storage: 2GB per user
- Network: Internal only + Cloudflare Tunnel

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

**Initial (< 100 users): Single Server + Docker Compose**
- Hetzner CX32 (8GB RAM) = ~15 agents
- Simple, easy to manage
- Manual scaling

**Growth (100-500 users): Docker Swarm**
- Multiple Hetzner servers
- Automatic container placement
- Built-in load balancing

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
| Clerk | $0 | Free tier (10k MAU) |
| Loops | $0 | Free tier (1k contacts) |
| Agentmail | $0 | Free tier |
| Browserbase | $20 | Developer plan |
| Smartproxy | $30 | Residential, if needed |
| **Total** | **$65** | Before users |

### Variable Costs (Per User)

| Item | Cost/User | Notes |
|------|-----------|-------|
| Compute | $3-5 | 512MB container |
| Storage | $0.50 | 2GB volume |
| Bandwidth | $0.50 | Cloudflare handles most |
| Browser | $0.10-1 | Browserbase usage |
| Email | $0 | Agentmail free tier |
| **Total** | **$4-7** | Per user/month |

### Break-Even Analysis

At $79/mo Starter plan:
- Gross margin: ~92% ($72.50)
- Fixed costs covered at: 1 paying user
- Profitable at: 10+ users

---

## Technical Decisions Log

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| Hosting | Vercel + Hetzner | Landing on Vercel (free), agents on Hetzner (cheap) | 2026-01-28 |
| Database | Neon Postgres | Serverless, free tier, Vercel integration | 2026-01-29 |
| Auth | Clerk | Fast implementation, good UX | 2026-01-29 |
| Email marketing | Loops.so | Modern, good API, free tier | 2026-01-29 |
| Transactional email | Agentmail | Built for AI agents, simple API | 2026-01-28 |
| Browser | Browserbase | Persistent contexts, stealth, managed | 2026-01-28 |
| Container orchestration | Docker Compose → Swarm | Simple first, scale later | 2026-01-29 |

---

## Next Actions (This Week)

### Priority 1 (Must Do)
1. [ ] Set up Stripe account and products
2. [ ] Set up Neon database with Prisma
3. [ ] Implement Clerk authentication
4. [ ] Build basic dashboard layout

### Priority 2 (Should Do)
5. [ ] Build setup wizard (API key + name)
6. [ ] Test Browserbase integration end-to-end
7. [ ] Create Dockerfile for agent containers
8. [ ] Set up Hetzner server

### Priority 3 (Nice to Have)
9. [ ] Discord integration guide
10. [ ] Telegram integration guide
11. [ ] Documentation site

---

## File Locations

```
/root/clawd/projects/automna/
├── SPEC.md              # Product specification
├── IMPLEMENTATION.md    # This file
├── landing/             # Next.js landing page (Vercel)
│   ├── src/app/
│   │   ├── page.tsx     # Main landing
│   │   ├── clawd/       # Clawdbot migration page
│   │   └── api/         # API routes
│   └── public/          # Static assets
├── dashboard/           # (TODO) Dashboard app
├── provisioner/         # (TODO) Container provisioning service
└── config/              # Service credentials
    ├── loops.json
    ├── agentmail.json
    ├── browserbase.json
    └── vercel.json
```

---

*This is a living document. Update as decisions are made and progress happens.*
