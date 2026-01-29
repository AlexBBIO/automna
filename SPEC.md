# Automna.ai — Product Specification

> **Note:** Original name was "Automna" but changed to "Automna" (K spelling) to avoid trademark conflict with Agent IQ (USPTO #99399937). Domain automna.ai confirmed available 2026-01-28.

**Version:** 0.1  
**Date:** 2026-01-28  
**Status:** Planning

---

## Executive Summary

Automna.ai is a hosted platform for fully agentic AI assistants powered by Clawdbot. Unlike ChatGPT or Claude Pro (which are just chat interfaces), Automna provides AI agents that **actually execute tasks**: browse the web, manage files, control integrations, automate workflows, and even build and deploy apps.

**Value Proposition:** "Your own, private, fully autonomous AI agent. Working in 60s."

**Alternative taglines:**
- "The AI assistant that actually does things."
- "Hire Claude. $79/month."
- "Not just chat. Execute."

**Business Model:** Premium SaaS subscription ($79-299/month) + BYOK (Bring Your Own Key) for Anthropic API costs.

**Key Differentiator:** We offer MORE than Claude Max ($100-200/mo) because we include:
- Fully managed cloud hosting (always on)
- Pre-configured integrations (Discord, Telegram, WhatsApp, web)
- Zero setup required
- User app hosting (agents can build and deploy web apps)

---

## Market Opportunity

### Problem
- Setting up Clawdbot requires: Node.js, CLI familiarity, server access, Docker (optional), API key configuration, integration setup
- Most potential users (creators, professionals, small businesses) don't have these skills
- Existing "AI assistant" products are either too simple (ChatGPT) or too complex (self-hosted agents)
- **ChatGPT/Claude Pro are just chat** — they don't execute tasks, manage files, or integrate with real tools

### Solution
- One-click deployment with guided setup
- Web-based dashboard for configuration
- Pre-configured integrations
- Managed infrastructure with automatic updates
- **Full agentic capabilities** — not just conversation, but execution

### What "Agentic" Means (Our Core Value)

This is NOT a chatbot. Users will have their agents:
- Schedule and post to Twitter/social media
- Monitor websites, scrape data, compile reports
- Manage files, organize projects, maintain codebases
- Control smart home devices, IoT integrations
- Research topics and synthesize information
- Automate repetitive workflows
- Send messages across platforms (Discord, Telegram, email)
- Run code, deploy applications
- Build and host simple web apps

**Positioning:** "Hire Claude. $79/month."

### Target Users
1. **Creators/Influencers** — Want AI to manage DMs, schedule content, research
2. **Solopreneurs** — Need an assistant but can't afford/manage human VA
3. **Developers** — Want Clawdbot but don't want to maintain infrastructure
4. **Small Teams** — Shared AI workspace for research, support, automation

### Market Size
- Claude API has millions of users
- r/ClaudeAI: 100k+ members
- Growing demand for "agentic" AI (not just chat)
- Competitor landscape is nascent

---

## Product Requirements

### Phase 1: MVP (Week 3-5)

#### User Stories
1. As a user, I can sign up and pay for a subscription
2. As a user, I can enter my Anthropic API key
3. As a user, I can deploy an agent with one click
4. As a user, I can chat with my agent via web interface
5. As a user, I can connect my agent to Discord
6. As a user, I can see my agent's status (online/offline)

#### Features
| Feature | Priority | Notes |
|---------|----------|-------|
| Landing page with waitlist | P0 | Validate demand |
| Stripe checkout | P0 | $29/mo starter plan |
| User authentication | P0 | Email + password, magic link |
| API key input | P0 | Encrypted storage |
| One-click deploy | P0 | Provisions container, starts Clawdbot |
| Web chat interface | P0 | Clawdbot built-in web UI |
| Discord integration setup | P1 | Guide user through bot token |
| Agent status dashboard | P1 | Online/offline, last active |
| ~~Subdomain per user~~ | ~~P2~~ | Removed — using path-based routing instead |

#### Non-Goals (MVP)
- Multiple agents per account
- Usage metering/limits
- Telegram/WhatsApp integrations
- Custom skills/tools
- Team features

### Phase 2: Production (Week 6-10)

#### Additional Features
| Feature | Priority | Notes |
|---------|----------|-------|
| Telegram integration | P0 | Bot token setup flow |
| WhatsApp integration | P1 | QR code linking |
| Admin dashboard | P0 | All instances, support access |
| User dashboard | P0 | Manage agent, update config |
| Usage monitoring | P1 | API calls, uptime |
| Automatic backups | P1 | Daily workspace snapshots |
| Multiple pricing tiers | P0 | Starter/Pro/Team |

### Phase 3: Growth (Month 3+)

#### Additional Features
| Feature | Priority | Notes |
|---------|----------|-------|
| Agent templates | P1 | Pre-configured for use cases |
| Skill marketplace | P2 | Community tools/integrations |
| White-label option | P2 | Agencies resell under their brand |
| Enterprise tier | P2 | Dedicated infra, SSO, audit logs |
| Mobile app | P3 | iOS/Android for push notifications |
| API access | P2 | Programmatic agent control |

---

## Technical Architecture

### Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare                              │
│              (DNS, SSL, DDoS, Tunnel to main server)         │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│              Main Server (automna.ai)                        │
│                  (Hetzner CX52 - 32GB)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────────────────┐  │
│  │  Dashboard  │ │   Proxy     │ │     Provisioner        │  │
│  │  (Next.js)  │ │   Layer     │ │  (Docker + Hetzner API)│  │
│  │  + Clerk    │ │             │ │                        │  │
│  └─────────────┘ └─────────────┘ └────────────────────────┘  │
│  ┌─────────────┐ ┌─────────────┐                             │
│  │  Postgres   │ │   Redis     │                             │
│  │  (Neon)     │ │  (optional) │                             │
│  └─────────────┘ └─────────────┘                             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Shared Containers (Starter/Pro)             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐             │   │
│  │  │ User A   │ │ User B   │ │ User C   │  ...        │   │
│  │  │ 2.5-4GB  │ │ 2.5-4GB  │ │ 2.5-4GB  │             │   │
│  │  └──────────┘ └──────────┘ └──────────┘             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
            Internal Network (Tailscale / Hetzner Private)
                          │
┌─────────────────────────▼───────────────────────────────────┐
│             Dedicated VMs (Business/Max)                     │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  User X         │  │  User Y         │                   │
│  │  CX32 (8GB)     │  │  CX42 (16GB)    │                   │
│  │  Full isolation │  │  Full isolation │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

**Key Points:**
- All traffic goes through main server (automna.ai)
- Auth is same-origin (Clerk cookie)
- Proxy routes to local containers OR remote VMs
- Users don't see infrastructure differences

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Landing/Marketing | Next.js + **Cloudflare Pages** | Free, fast, same ecosystem as tunnels |
| Dashboard Frontend | Next.js | Same stack, shared components |
| API Backend | FastAPI (Python) | Fast, async, good Docker SDK |
| Database | PostgreSQL | Reliable, Hetzner managed option |
| Cache/Queue | Redis | Session management, job queue |
| Container Orchestration | Docker Swarm | Simpler than K8s for this scale |
| Infrastructure | Hetzner Cloud | Best price/performance, EU+US |
| CDN/Security/Tunnels | **Cloudflare** | DNS, SSL, DDoS, Tunnels for user apps |
| Payments | Stripe | Industry standard |
| Auth | Clerk or Auth.js | Don't roll our own |
| Monitoring | Uptime Kuma + Grafana | Self-hosted, low cost |

**Why Cloudflare ecosystem:**
1. Landing page → Cloudflare Pages (free, fast)
2. Agent hosting → Hetzner + Cloudflare Tunnels
3. User app hosting → Cloudflare Tunnels expose apps from agent containers
4. DNS/SSL/DDoS → All unified in Cloudflare

### User App Hosting (Phase 3+ Feature)

Agents can build and deploy web apps for users. Architecture:

```
User: "Build me a dashboard for my sales data"
Agent: *builds app, saves to /apps/sales-dashboard*
System: Auto-exposes via Cloudflare Tunnel
Result: Live at automna.ai/apps/{userId}/sales-dashboard
```

**Implementation:**
- Each user container has an `/apps` directory
- Cloudflare Tunnel daemon runs in container
- Apps auto-exposed at `{app-name}.{username}.automna.ai`
- No separate hosting needed — runs in same container as agent

**This is a killer feature:** "Your agent can build AND deploy apps."

### Container Specification

Each user agent runs in an isolated Docker container:

```yaml
# docker-compose template per user
version: '3.8'
services:
  clawdbot:
    image: automna/clawdbot:latest
    container_name: agent_${USER_ID}
    restart: unless-stopped
    mem_limit: 512m
    cpus: 0.5
    environment:
      - ANTHROPIC_API_KEY=${ENCRYPTED_KEY}
      - CLAWDBOT_WEB_PORT=18789
      - CLAWDBOT_CONFIG=/config/clawdbot.json
    volumes:
      - agent_${USER_ID}_data:/root/clawd
      - agent_${USER_ID}_config:/config
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.agent_${USER_ID}.rule=PathPrefix(`/a/${USER_ID}`)"
      - "traefik.http.middlewares.agent_${USER_ID}_strip.stripprefix.prefixes=/a/${USER_ID}"
    networks:
      - agent_network
```

### Browser Service (Browserbase)

Agents need real browser capabilities for web automation, OAuth logins, and sites that require JavaScript. Rather than running full browsers in each container (heavy, expensive), we use **Browserbase** — a cloud browser service.

**Why Browserbase:**
- Persistent contexts (sessions) per customer
- Customers log into Gmail/Twitter/etc once, stays logged in
- Stealth mode + auto captcha solving included
- Isolated per customer — no credential cross-contamination
- Pay-per-use, no heavy browser in each container

**Pricing (Jan 2026):**
| Plan | Cost | Browser Hours | Concurrent Sessions |
|------|------|---------------|---------------------|
| Free | $0/mo | 1 hour | 1 |
| Developer | $20/mo | 100 hours | 25 |
| Startup | $99/mo | 500 hours | 100 |
| Scale | Custom | Usage-based | 250+ |

Overage: ~$0.10-0.12/browser hour

**Architecture:**
```
User signs up → Create Browserbase context (contextId)
First browser task → Start session with contextId, user logs in
Future tasks → Load contextId, already authenticated
```

**Implementation:**
- Store `contextId` per customer in our database
- Agent calls Browserbase API when browser needed
- Sessions persist cookies, localStorage, auth tokens
- Contexts live indefinitely until deleted

**Cost per customer:** Minimal — most users need <1 hour/month of browser time. Heavy users (lots of scraping) might use 5-10 hours. At $0.10/hour, this is $0.10-$1/month per user.

**Integration with Clawdbot:**
- Create Clawdbot skill or tool that wraps Browserbase SDK
- Agent can: `browser_open(url)`, `browser_login(site)`, `browser_screenshot()`, etc.
- Transparent to end user — "browse to X" just works

**Security:**
- Each customer gets isolated browser context
- Credentials stored in Browserbase (not our database)
- API key scoped per project
- Can delete context on customer churn

**Links:**
- Docs: https://docs.browserbase.com
- Contexts: https://docs.browserbase.com/features/contexts
- Pricing: https://www.browserbase.com/pricing

### Security Model

| Layer | Implementation |
|-------|----------------|
| API Keys | Encrypted at rest (AES-256), never logged |
| User Isolation | Separate containers, no shared filesystems |
| Browser Sessions | Browserbase contexts, isolated per customer |
| Network | Internal Docker network, only exposed via Traefik |
| Access | Cloudflare Access for admin, JWT for users |
| Secrets | HashiCorp Vault or encrypted env vars |
| Backups | Encrypted daily snapshots to Hetzner Storage Box |

### Gateway Authentication (Same-Origin Cookie + Proxy)

All requests go through `automna.ai` (main server). Auth is same-origin cookies, then proxy to the right backend.

**URL Structure:**
```
automna.ai/                     # Landing page
automna.ai/dashboard            # User dashboard  
automna.ai/a/{userId}/chat      # Agent chat UI (proxied to backend)
automna.ai/a/{userId}/ws        # Agent WebSocket (proxied to backend)
```

**Multi-Server Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Main Server (automna.ai)                 │
│  ┌─────────────┐  ┌─────────────────────────────────────┐  │
│  │  Dashboard  │  │            Proxy Layer              │  │
│  │  (Next.js)  │  │  /a/user1/* → localhost:3001        │  │
│  │             │  │  /a/user2/* → localhost:3002        │  │
│  │  Clerk Auth │  │  /a/user3/* → 10.0.1.5:18789 (VM)   │  │
│  └─────────────┘  │  /a/user4/* → 10.0.1.6:18789 (VM)   │  │
│                   └─────────────────────────────────────┘  │
│  ┌──────────┐ ┌──────────┐                                 │
│  │ Shared   │ │ Shared   │  ← Starter/Pro containers      │
│  │ user1    │ │ user2    │    (same server)               │
│  └──────────┘ └──────────┘                                 │
└─────────────────────────────────────────────────────────────┘
         │ Internal network (Tailscale or private Hetzner network)
         │
┌────────┴────────┐  ┌─────────────────┐
│  Dedicated VM   │  │  Dedicated VM   │  ← Business/Max VMs
│  user3 (CX32)   │  │  user4 (CX42)   │    (separate servers)
│  Clawdbot       │  │  Clawdbot       │
└─────────────────┘  └─────────────────┘
```

**Auth Flow:**
```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Browser       │      │   Main Server    │      │  User Backend   │
│                 │      │   (automna.ai)   │      │ (local or remote)│
└────────┬────────┘      └────────┬─────────┘      └────────┬────────┘
         │                        │                         │
         │ 1. Login via Clerk     │                         │
         │ ──────────────────────►│                         │
         │                        │                         │
         │ 2. Clerk session cookie│                         │
         │ ◄──────────────────────│                         │
         │                        │                         │
         │ 3. Visit /a/{userId}/  │                         │
         │ ──────────────────────►│                         │
         │                        │                         │
         │                        │ 4. Verify Clerk session │
         │                        │    Look up user's backend│
         │                        │                         │
         │                        │ 5. Proxy request        │
         │                        │ ───────────────────────►│
         │                        │   (internal auth)       │
         │                        │                         │
         │ 6. Response            │                         │
         │ ◄──────────────────────────────────────────────────
```

**Backend Lookup:**
```typescript
// Database stores where each user's agent runs
interface UserAgent {
  userId: string;
  tier: 'starter' | 'pro' | 'business' | 'max';
  backendType: 'local' | 'remote';
  // For local (shared containers):
  containerPort?: number;  // e.g., 3001
  // For remote (dedicated VMs):
  vmIp?: string;           // e.g., "10.0.1.5"
  vmPort?: number;         // e.g., 18789
}
```

**How It Works:**
1. User logs in via Clerk → gets session cookie on `automna.ai`
2. User visits `/a/{userId}/chat`
3. Middleware verifies Clerk session + user owns the agent
4. Look up user's backend location (local container or remote VM)
5. Proxy request to correct backend with internal auth header
6. User doesn't know/care if they're on shared or dedicated infra

**Two-Layer Auth (User vs Service-to-Service):**
```
Browser                    Main Server              Backend (any server)
   │                      (automna.ai)              (local or remote)
   │                           │                           │
   │  1. Request + Clerk       │                           │
   │     session cookie        │                           │
   │ ─────────────────────────►│                           │
   │                           │                           │
   │                      2. Validate Clerk                │
   │                         session cookie                │
   │                           │                           │
   │                      3. Look up backend               │
   │                         from database                 │
   │                           │                           │
   │                           │  4. Forward with          │
   │                           │     internal auth         │
   │                           │ ─────────────────────────►│
   │                           │     X-Automna-Internal    │
   │                           │                           │
   │                           │  5. Backend validates     │
   │                           │     internal token        │
   │                           │                           │
   │                           │  6. Response              │
   │                           │ ◄─────────────────────────│
   │  7. Response              │                           │
   │ ◄─────────────────────────│                           │
```

**What Each Component Validates:**

| Component | Validates | Trusts |
|-----------|-----------|--------|
| Main server (proxy) | Clerk session cookie, user owns agent | Nothing - it's the auth source |
| Backend (container/VM) | Internal auth header only | Requests from main server |

**Why This Works Across Servers:**
- Backend doesn't need to know about Clerk
- Backend only validates the internal `X-Automna-Internal` header
- Same internal token works for all backends
- Only the main server proxy knows the internal token
- Works whether backend is localhost, same datacenter, or another region

**Implementation:**

1. **Middleware** (auth check):
```typescript
// middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname;
  
  // Agent routes require auth
  if (path.startsWith('/a/')) {
    const { userId } = await auth();
    if (!userId) {
      return Response.redirect(new URL('/sign-in', req.url));
    }
    
    // Extract userId from path: /a/{userId}/...
    const pathUserId = path.split('/')[2];
    
    // Verify user can only access their own agent
    const user = await getUser(userId);
    if (user.id !== pathUserId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
});
```

2. **Proxy Route** (forwards to correct backend):
```typescript
// app/a/[userId]/[...path]/route.ts
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request, { params }) {
  const { userId } = await auth();
  const user = await db.user.findUnique({ where: { clerkId: userId } });
  
  // Look up where this user's agent runs
  const agent = await db.agent.findUnique({ where: { userId: user.id } });
  
  // Build backend URL based on type
  let backendUrl: string;
  if (agent.backendType === 'local') {
    // Shared container on this server
    backendUrl = `http://localhost:${agent.containerPort}`;
  } else {
    // Dedicated VM on another server
    backendUrl = `http://${agent.vmIp}:${agent.vmPort}`;
  }
  
  // Forward request with internal auth header
  const proxyRes = await fetch(`${backendUrl}/${params.path.join('/')}`, {
    headers: {
      'X-Automna-Internal': process.env.INTERNAL_PROXY_SECRET,
      'X-Automna-User': user.id,
    }
  });
  
  return proxyRes;
}
```

3. **WebSocket Proxy** (for chat streaming):
```typescript
// app/a/[userId]/ws/route.ts
import { auth } from '@clerk/nextjs/server';
import { WebSocketServer } from 'ws';

export async function UPGRADE(req: Request, { params }) {
  const { userId } = await auth();
  const agent = await getAgentBackend(userId);
  
  // Accept client connection
  const clientWs = await acceptWebSocket(req);
  
  // Connect to backend with internal auth
  const backendWs = new WebSocket(
    agent.backendType === 'local' 
      ? `ws://localhost:${agent.containerPort}`
      : `ws://${agent.vmIp}:${agent.vmPort}`,
    {
      headers: {
        'X-Automna-Internal': process.env.INTERNAL_PROXY_SECRET,
      }
    }
  );
  
  // Relay messages both directions
  clientWs.on('message', (data) => backendWs.send(data));
  backendWs.on('message', (data) => clientWs.send(data));
  
  // Handle disconnects
  clientWs.on('close', () => backendWs.close());
  backendWs.on('close', () => clientWs.close());
}
```

4. **Backend Config** (same for all backends):
```json
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "${INTERNAL_PROXY_SECRET}"
    },
    "trustedProxies": ["10.0.0.0/8", "172.16.0.0/12", "100.64.0.0/10"]
  }
}
```

**Note on trustedProxies:**
- `10.0.0.0/8` - Hetzner private network
- `172.16.0.0/12` - Docker networks
- `100.64.0.0/10` - Tailscale CGNAT range (if using Tailscale mesh)

All backends use the same `INTERNAL_PROXY_SECRET`. This token is:
- Generated once, stored in our secrets manager
- Never exposed to users
- Used only for service-to-service auth between proxy and backends

**Security Properties:**
- ✅ Same-origin: Clerk cookie works automatically
- ✅ User isolation: Middleware verifies userId match
- ✅ Internal auth: Containers only accept requests from proxy
- ✅ No tokens in URLs: Auth is cookie-based
- ✅ HttpOnly cookies: Clerk handles this
- ✅ Simple: No exchange tokens, no cross-origin dance

**Benefits of Path-Based:**
- Simpler auth (same-origin cookies)
- Easier debugging (one domain)
- No wildcard SSL certs needed
- No DNS complexity
- Faster time to market

**Future: Custom Domains (if needed)**
Can add subdomain/custom domain support later as a premium feature. The proxy layer makes this possible without changing container architecture.

### Custom Chat UI

We build a custom chat interface using **assistant-ui** (open source, MIT) instead of embedding Clawdbot's Control UI.

**Why:**
- Clean, branded experience
- Only show chat (hide config/cron/nodes)
- Full control over UX
- File/image support built-in
- Future: artifact previews like Claude

**Architecture:**
- assistant-ui components handle UI (streaming, auto-scroll, attachments)
- Custom ClawdbotRuntimeAdapter translates to Clawdbot WebSocket API
- WebSocket proxied through our backend for auth

**Full spec:** See `CHAT-UI-SPEC.md`

### Scaling Strategy

| Users | Infrastructure | Monthly Cost |
|-------|---------------|--------------|
| 1-20 | Single CX32 (8GB) | ~$15 |
| 20-50 | CX42 (16GB) | ~$30 |
| 50-100 | 2x CX32 | ~$30 |
| 100-500 | Docker Swarm cluster (3-5 nodes) | ~$100-200 |
| 500+ | Kubernetes migration | Variable |

---

## Business Model

### Pricing Tiers

| Tier | Price | Resources | API Model | Credits |
|------|-------|-----------|-----------|---------|
| **Starter** | $29/mo | 2.5GB shared | BYOK | 500/mo* |
| **Pro** | $79/mo | 4GB shared | BYOK | 2,000/mo* |
| **Business** | $129/mo | 8GB dedicated VM | Credits | 15,000/mo |
| **Max** | $249/mo | 16GB dedicated VM | Credits | 40,000/mo |
| **Enterprise** | Contact us | Custom | Custom | Custom |

*BYOK tiers: Credits cover browser automation, storage, extras only. AI usage is on user's Anthropic key.

**Shared vs Dedicated:**
- **Shared (Starter/Pro):** Container on multi-tenant server. Cost-efficient, still isolated.
- **Dedicated VM (Business/Max):** Own Hetzner VM. Full isolation, guaranteed resources.

**Comparison to alternatives:**
- Human VA: $15-25/hr = $2,400-4,000/mo
- ChatGPT/Claude Pro: $20/mo but chat-only, no execution
- Automna: $29-249/mo for full agentic capabilities

### Automna Credits System

Credits are a universal resource covering all platform usage:

| Resource | Credits |
|----------|---------|
| 1 AI message (Sonnet) | 1 |
| 1 AI message (Opus / extended thinking) | 5 |
| 1 minute browser automation | 2 |
| 100MB storage (monthly) | 10 |
| 1 scheduled task run | 1 |
| 1 email sent | 1 |

**Overage pricing:** $10 per 1,000 credits ($0.01/credit)

**Why credits:**
- Simple UX: "You have 8,432 credits remaining"
- Covers multiple cost centers (API, browser, storage) in one number
- Decouples from Anthropic pricing changes
- Enables promos, bonuses, add-on packs

### Cost Structure (Per User)

| Tier | Price | Infra Cost | Credit Cost* | Total Cost | Margin |
|------|-------|------------|--------------|------------|--------|
| Starter $29 | $29 | ~$5 | — (BYOK) | ~$5 | 83% |
| Pro $79 | $79 | ~$9 | — (BYOK) | ~$9 | 89% |
| Business $129 | $129 | ~$14 | ~$15 | ~$29 | 78% |
| Max $249 | $249 | ~$27 | ~$40 | ~$67 | 73% |

*Credit cost assumes average usage. Heavy users generate overage revenue.

**Infrastructure costs:**
- Shared (Starter/Pro): Containers on CX52 (32GB) — €49/mo ÷ users
- Business 8GB VM: CX32 — €13/mo
- Max 16GB VM: CX42 — €25/mo

### Revenue Projections

| Month | Users | Avg Price | MRR | Costs | Profit |
|-------|-------|-----------|-----|-------|--------|
| 3 | 50 | $80 | $4,000 | $500 | $3,500 |
| 6 | 150 | $90 | $13,500 | $1,500 | $12,000 |
| 12 | 400 | $100 | $40,000 | $5,000 | $35,000 |

At $100 average (mix of tiers):
- 100 users = $10,000 MRR
- 500 users = $50,000 MRR
- 1,000 users = $100,000 MRR

**Overage upside:** Business/Max users who exceed credits add incremental revenue at high margin.

### API Key Model (BYOK)

Users bring their own Anthropic API key because:
1. No margin risk on heavy users
2. Clear value separation (we = hosting, they = AI usage)
3. Users get Anthropic's free tier to start
4. Avoids reseller complexity

Future option: "Credits included" tier at premium price once we have volume for reseller terms.

### ⚠️ Claude Max Subscription — NOT VIABLE

**Researched 2026-01-28:** We considered allowing users to connect their Claude Max ($100-200/mo) subscription instead of API keys, since Max offers unlimited Claude Code usage.

**Finding:** This violates Anthropic's Terms of Service.

> "The Max plan updates apply exclusively to Claude Free, Pro, and Max consumer accounts. If you use Claude Max to power third-party agents or services, this violates the terms of service."
> — Anthropic Consumer ToS Updates (October 2025)

**Implications:**
- ❌ Cannot offer "Connect your Max account" feature
- ❌ OAuth-based Claude authentication for hosted agents = ToS violation
- ✅ API keys (BYOK) remain the only compliant option
- ✅ Could negotiate reseller/commercial terms with Anthropic later for bundled credits

**API Pricing Reference (Jan 2026):**

| Model | Input/MTok | Output/MTok | Typical Use Case |
|-------|------------|-------------|------------------|
| Haiku 3.5 | $0.80 | $4 | High-volume, simple tasks |
| Sonnet 3.7/4.5 | $3 | $15 | Balanced (default) |
| Opus 4.1 | $15 | $75 | Complex reasoning |

**Estimated User API Costs:**
- Light user (10 convos/day): ~$5-15/month
- Moderate user (30 convos/day): ~$15-50/month  
- Heavy user (50+ convos/day): ~$50-150/month

This reinforces our BYOK model — users pay Anthropic directly for usage, we charge for hosting/convenience.

---

## User Experience

### Onboarding Flow

```
1. Landing Page
   └── "Get Started" CTA
   
2. Sign Up
   └── Email + Password (or Google OAuth)
   
3. Choose Plan
   └── Starter / Pro / Team
   └── Stripe Checkout
   
4. Setup Wizard
   ├── Step 1: Enter Anthropic API Key
   │   └── Link to get key + validation
   ├── Step 2: Name Your Agent
   │   └── Personality prompt (optional)
   ├── Step 3: Choose Integrations
   │   └── Discord / Telegram / Web only
   └── Step 4: Deploy
       └── Progress bar → "Your agent is live!"
       
5. Dashboard
   └── Chat interface + settings
```

### Dashboard Features

**Main View:**
- Chat interface (primary)
- Agent status indicator
- Quick settings

**Settings Panel:**
- API key management
- Integration connections
- Personality/system prompt
- Memory management (view/clear)

**Integrations Page:**
- Discord: Bot token input, server selector
- Telegram: Bot token input, test message
- WhatsApp: QR code linking flow
- Web: Embed code for websites

### Error States

| Scenario | User Message | Action |
|----------|--------------|--------|
| Invalid API key | "API key invalid. Please check and try again." | Re-enter key |
| API key expired | "Your Anthropic API key has expired or hit limits." | Link to Anthropic billing |
| Container failed | "Agent temporarily unavailable. We're on it." | Auto-restart + alert us |
| Payment failed | "Payment failed. Update your card to keep your agent running." | Stripe billing portal |

---

## Go-to-Market Strategy

### Phase 1: Validation (Week 1-2)

**Channels:**
- Reddit: r/ClaudeAI, r/LocalLLaMA, r/selfhosted, r/SideProject
- Hacker News: "Show HN: One-click AI agent hosting"
- Twitter/X: AI community, indie hackers, solopreneurs
- Clawdbot Discord: Community announcement (with maintainer approval)
- Product Hunt: Save for launch day

**Landing Page Messaging:**

> **Your AI agent, deployed in 60 seconds.**
> 
> Skip the server setup. Skip the Docker commands. Skip the config files.
> 
> Automna gives you a personal AI assistant that lives in your Discord, 
> Telegram, or browser — with memory, tools, and real capabilities.
> 
> Just bring your Claude API key. We handle everything else.
>
> [Join Waitlist]

**Waitlist Goal:** 200+ signups = proceed to MVP

### Phase 2: Beta Launch (Week 5)

- Email waitlist with beta access
- Limited to first 50 users
- $19/mo beta pricing (locked in for 12 months)
- Feedback form + Discord community

### Phase 3: Public Launch (Week 8)

- Product Hunt launch
- Full pricing tiers
- Referral program ($10 credit per referral)
- Content marketing (tutorials, use cases)

### Messaging by Audience

| Audience | Pain Point | Message |
|----------|------------|---------|
| Developers | "I want Clawdbot but don't want to maintain it" | "Clawdbot hosting done right. We keep it updated, you use it." |
| Creators | "I need help managing DMs and content" | "An AI assistant that lives in your Discord 24/7" |
| Solopreneurs | "I can't afford a VA but need help" | "Your $29/mo assistant that actually does things" |
| Small Teams | "We need shared AI workspace" | "One agent, whole team access, persistent memory" |

---

## Competitive Analysis

| Competitor | Price | Model | Pros | Cons |
|------------|-------|-------|------|------|
| **ChatGPT Plus** | $20/mo | Chat only | Brand recognition, simple | No execution, no integrations, limited memory |
| **Claude Pro** | $20/mo | Chat only | Great model | Same limitations as ChatGPT |
| **Claude Max** | $100-200/mo | Claude Code (local) | Unlimited usage, full agent | YOU set up everything, no integrations, not always-on |
| **Poe** | $20/mo | Multi-model chat | Many models | Chat only, no agent capabilities |
| **Character.ai** | Free/Premium | Chat personas | Fun, engaging | Entertainment only, no productivity |
| **Self-hosted Clawdbot** | DIY | Full agent | Full control, free | Requires technical skills, maintenance burden |
| **Automna** | $79-299/mo | Full managed agent | Always-on, integrations, app hosting, zero setup | Newer, smaller |

**Our Differentiators:**
1. **Full execution** — Not chat, actual task completion
2. **Always-on cloud hosting** — Your agent works while you sleep
3. **Pre-configured integrations** — Discord, Telegram, WhatsApp, web
4. **Persistent memory** — Remembers everything across sessions
5. **App hosting** — Agents can build and deploy web apps
6. **Zero maintenance** — We handle updates, security, uptime
7. **More than Claude Max** — Same capabilities + managed + integrated

**Why we win:**
- vs ChatGPT/Claude Pro: We execute, they just chat
- vs Claude Max: We're fully managed, they're DIY
- vs Self-hosted: We're zero-effort, they require expertise
- vs Human VA: We're 10-50x cheaper

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Anthropic API changes | Medium | High | Abstract API layer, multi-model support later |
| Clawdbot breaking changes | Medium | High | Pin versions, maintain fork if needed |
| Low demand | Medium | High | Validate with waitlist before building |
| Security breach | Low | Critical | Encryption, isolation, audits, insurance |
| Hetzner outage | Low | High | Multi-region, automated failover |
| Competition | High | Medium | Move fast, focus on UX, build community |

---

## Success Metrics

### North Star
**Monthly Recurring Revenue (MRR)**

### Leading Indicators
| Metric | Target (Month 3) | Target (Month 6) |
|--------|------------------|------------------|
| Waitlist signups | 500 | N/A |
| Paying users | 50 | 200 |
| MRR | $1,500 | $6,000 |
| Churn rate | <10% | <8% |
| NPS | >40 | >50 |

### Operational Metrics
- Uptime: >99.5%
- Deploy time: <2 minutes
- Support response: <4 hours
- Container density: 15+ per GB RAM

---

## Timeline

### Week 1-2: Validation
- [x] Register domain (automna.ai) ✓ 2026-01-28
- [ ] Build landing page
- [ ] Set up waitlist (email capture)
- [ ] Post to Reddit, HN, Twitter
- [ ] Reach 200 signups

### Week 3-4: Foundation
- [ ] Set up Hetzner infrastructure
- [ ] Build Docker container image
- [ ] Create provisioning API
- [ ] Stripe integration
- [ ] Basic auth system

### Week 5: MVP Launch
- [ ] User dashboard (minimal)
- [ ] One-click deploy flow
- [ ] Discord integration guide
- [ ] Beta invite to waitlist
- [ ] Onboard first 20 users

### Week 6-8: Iteration
- [ ] User feedback integration
- [ ] Telegram support
- [ ] Improved dashboard
- [ ] Monitoring/alerting
- [ ] Documentation

### Week 9-10: Public Launch
- [ ] Product Hunt submission
- [ ] Full pricing tiers
- [ ] Referral program
- [ ] Content marketing

---

## Current Status (2026-01-29)

### ✅ Completed
- Domain registered: automna.ai
- Browserbase account created + API integrated (contexts for per-customer browser sessions)
- Agentmail set up: automnajoi@agentmail.to (transactional email for notifications)
- Discord bot created: Automna#4978 (App ID: 1466131766015332382)
- Initial product spec drafted

### 🔧 Infrastructure Ready
| Service | Status | Notes |
|---------|--------|-------|
| Domain | ✅ Ready | automna.ai registered |
| Browser Service | ✅ Ready | Browserbase free tier (1hr/mo) |
| Email | ✅ Ready | Agentmail transactional |
| Discord Bot | ✅ Created | Token stored, needs features |
| Hetzner Server | ✅ Existing | Current server can host MVP |

### 🎯 Next Steps (Priority Order)
1. **Landing page** — Simple page with waitlist capture on Cloudflare Pages
2. **Bot functionality** — Basic Clawdbot features in Discord bot
3. **Waitlist validation** — Post to Reddit/HN, gauge demand before building full platform

---

## Open Questions

1. **Naming:** Automna.ai confirmed? Check trademark conflicts?
2. **Founding team:** Solo or bring in co-founder for dev work?
3. **Legal:** Terms of service, privacy policy, liability for user agents
4. **Support:** Email only? Discord community? Live chat?
5. **Clawdbot relationship:** Reach out to maintainer for endorsement/partnership?

---

## Appendix

### A. Landing Page Copy (Draft)

**Headline:** The AI assistant that actually does things.

**Subhead:** Not just chat. Execute. Your personal Claude agent that browses the web, manages files, automates workflows, and deploys apps — always on, always ready.

**Alternative Headlines:**
- "Hire Claude. $79/month."
- "Your digital employee, deployed in 60 seconds."
- "Claude that works, not just talks."

**Features:**
- ⚡ **Execute, don't just chat** — Automate tasks, manage files, control integrations
- 🌐 **Always on** — Lives in the cloud, available 24/7
- 💬 **Multi-platform** — Discord, Telegram, WhatsApp, Web
- 🧠 **Persistent memory** — Remembers everything across sessions
- 🚀 **Build & deploy** — Your agent can create and host web apps
- 🔒 **Your data** — Your API key, your control, encrypted

**CTA:** Join the Waitlist →

**Social Proof:** (Add after beta) "Finally, an AI that does my actual work." — Beta User

**Comparison Section:**
| Feature | ChatGPT/Claude | Automna |
|---------|---------------|-----------|
| Chat | ✅ | ✅ |
| Execute tasks | ❌ | ✅ |
| File management | ❌ | ✅ |
| Integrations | ❌ | ✅ |
| Always on | ❌ | ✅ |
| Build apps | ❌ | ✅ |
| Memory | Limited | ✅ Persistent |

### B. Competitor Pricing Reference

- ChatGPT Plus: $20/mo (chat only)
- Claude Pro: $20/mo (chat only)
- Claude Max: $100-200/mo (Claude Code on YOUR machine, no integrations)
- Human VA: $2,400-4,000/mo

**Our positioning:** Premium tier ($79-299/mo) but fraction of human VA cost, more capable than Claude Max (fully managed + integrations + app hosting).

### C. Clawdbot License

MIT License — allows commercial use, modification, distribution. Requires copyright notice in copies.

---

*Document maintained by Nova. Last updated: 2026-01-28*
