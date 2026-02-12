# BYOK Pivot — Implementation Plan

> **Date:** 2026-02-12
> **Status:** Planning
> **Companion doc:** `PRICING-BYOK-PIVOT.md` (tier structure + cost analysis)

---

## Overview

Three workstreams:
1. **Backend changes** — new tiers, direct-to-Anthropic auth, feature gating
2. **Migration** — move existing users to new tiers
3. **Onboarding flow** — new user signup experience

Estimated total effort: **5-7 days** (can ship incrementally)

---

## Architecture Decision: Direct to Anthropic

**No LLM proxy.** User's OpenClaw machine talks directly to Anthropic with their own credentials.

```
LLM calls:      OpenClaw → Anthropic (direct, user's setup-token or API key)
Service calls:   OpenClaw → Our proxies (search, browser, email, phone)
```

**Why:**
- Zero latency on LLM calls
- OAuth/setup-tokens work naturally (credential lives on machine)
- No LLM proxy to scale or maintain
- Clean separation: LLM = user's cost, platform services = our cost

**What we remove:**
- `/api/llm/v1/messages/route.ts` — deprecated
- LLM rate limiting, credit budget system — removed
- `ANTHROPIC_BASE_URL` env var on machines — removed (defaults to api.anthropic.com)

**What we keep:**
- Non-LLM proxies (Browserbase, Perplexity, Bland AI, Agentmail) — our API keys, our costs
- Service usage caps enforced in those proxy routes
- Gateway token auth for non-LLM proxies + dashboard API

---

## Authentication: Two Paths

### Path 1: Claude Code Setup Token (Recommended)

Users with a Claude Pro ($20/mo) or Max ($100-200/mo) subscription use `claude setup-token` to generate an OAuth token (`sk-ant-oat01-...`).

**How it works:**
1. User runs `claude setup-token` in their terminal
2. Claude CLI opens browser → user signs in with Anthropic
3. CLI generates setup token (OAuth access token)
4. User pastes token in our dashboard
5. We validate + push to their Fly machine

**How the token gets on the machine:**
```bash
# Option A: Non-interactive onboard command via Fly SSH
fly ssh console -a automna-u-xxx -C "openclaw onboard \
  --non-interactive --accept-risk \
  --auth-choice token \
  --token-provider anthropic \
  --token sk-ant-oat01-..."

# Option B: Direct write to auth-profiles.json on volume
# Write credential JSON to /home/node/.openclaw/agents/main/agent/auth-profiles.json
# Then restart gateway
```

**Token format in auth-profiles.json:**
```json
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "access": "sk-ant-oat01-..."
    }
  },
  "order": {
    "anthropic": ["anthropic:default"]
  },
  "lastGood": {
    "anthropic": "anthropic:default"
  }
}
```

**Advantages:**
- Flat cost — uses their existing Claude subscription
- Token carries subscription tier (Pro/Max/Team)
- Refresh built in
- No raw API key management

### Path 2: Anthropic API Key (Alternative)

For developers who prefer direct API access or don't have a Claude subscription.

**How it works:**
1. User gets key from console.anthropic.com
2. Pastes in our dashboard
3. We validate + push to machine as `ANTHROPIC_API_KEY` env var or auth profile

**Token format in auth-profiles.json:**
```json
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "token": "sk-ant-api03-..."
    }
  }
}
```

**⚠️ Cost warning:** API keys use pay-per-use pricing. Costs vary widely — light use may be $20/mo, but heavy use with Claude Opus can run **$100-500+/mo**.

---

## Workstream 1: Backend Changes

### Phase 1A: Schema & Tier Changes (~1 day)

**Database (Turso):**

```sql
-- Add BYOK columns to machines table
ALTER TABLE machines ADD COLUMN byok_provider TEXT;          -- 'anthropic_oauth' | 'anthropic_api_key' | null
ALTER TABLE machines ADD COLUMN byok_enabled INTEGER DEFAULT 0;
```

The credential itself gets stored in the existing `secrets` table (already has AES-256-GCM encryption):
```sql
-- Use existing secrets table
-- name = 'anthropic_setup_token' or 'anthropic_api_key'
-- encrypted value stored
-- Already indexed by (user_id, name)
```

**Update PLAN_LIMITS in `schema.ts`:**

```typescript
export const PLAN_LIMITS = {
  starter: {
    // $20/mo — sleeps idle, 1 channel, no phone, no cron
    requestsPerMinute: 10,
    monthlySearches: 500,
    monthlyBrowserMinutes: 60,
    monthlyEmails: 100,
    monthlyCallMinutes: 0,
    maxChannels: 1,
    cronEnabled: false,
    customSkills: false,
    fileBrowser: false,
    apiAccess: false,
    sleepWhenIdle: true,
  },
  pro: {
    // $30/mo — always-on, 3 channels, phone, cron
    requestsPerMinute: 20,
    monthlySearches: 2_000,
    monthlyBrowserMinutes: 300,
    monthlyEmails: 500,
    monthlyCallMinutes: 60,
    maxChannels: 3,
    cronEnabled: true,
    customSkills: true,
    fileBrowser: true,
    apiAccess: false,
    sleepWhenIdle: false,
  },
  power: {
    // $40/mo — unlimited channels, API, team
    requestsPerMinute: 30,
    monthlySearches: 10_000,
    monthlyBrowserMinutes: 1_000,
    monthlyEmails: 2_000,
    monthlyCallMinutes: 120,
    maxChannels: -1,
    cronEnabled: true,
    customSkills: true,
    fileBrowser: true,
    apiAccess: true,
    sleepWhenIdle: false,
  },
} as const;
```

**Stripe products (create new):**

| Product | Price | Stripe Price ID |
|---|---|---|
| Automna Starter (BYOK) | $20/mo | Create new |
| Automna Pro (BYOK) | $30/mo | Create new |
| Automna Power (BYOK) | $40/mo | Create new |

---

### Phase 1B: BYOK Credential Management (~1 day)

**New API routes:**

```
POST   /api/user/byok         — Save credential (encrypt + store + push to machine)
DELETE /api/user/byok         — Remove credential
GET    /api/user/byok/status  — Check BYOK status (enabled, type, valid, last validated)
POST   /api/user/byok/test    — Validate credential against Anthropic API
```

**Validation logic:**

```typescript
// Detect credential type from format
function detectCredentialType(token: string): 'setup_token' | 'api_key' | 'invalid' {
  if (token.startsWith('sk-ant-oat')) return 'setup_token';
  if (token.startsWith('sk-ant-api')) return 'api_key';
  return 'invalid';
}

// Validate by making a lightweight Anthropic API call
async function validateCredential(token: string, type: string): Promise<boolean> {
  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };

  // Both setup tokens and API keys use x-api-key header
  headers['x-api-key'] = token;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    return res.ok || res.status === 400; // 400 = valid creds, bad request is fine
  } catch {
    return false;
  }
}
```

**Push credential to Fly machine:**

```typescript
async function pushCredentialToMachine(
  appName: string,
  machineId: string,
  credential: string,
  type: 'setup_token' | 'api_key'
) {
  // Write auth-profiles.json to the machine via Fly SSH exec
  const authProfile = type === 'setup_token'
    ? { type: 'token', provider: 'anthropic', access: credential }
    : { type: 'token', provider: 'anthropic', token: credential };

  const profilesJson = JSON.stringify({
    version: 1,
    profiles: { 'anthropic:default': authProfile },
    order: { anthropic: ['anthropic:default'] },
    lastGood: { anthropic: 'anthropic:default' },
  }, null, 2);

  // Write to machine
  const authPath = '/home/node/.openclaw/agents/main/agent/auth-profiles.json';
  await flyExec(appName, `sh -c 'cat > ${authPath} << EOFAUTH\n${profilesJson}\nEOFAUTH'`);

  // Update OpenClaw config to use anthropic provider directly (not automna proxy)
  // Remove ANTHROPIC_BASE_URL so it defaults to api.anthropic.com
  await flyExec(appName, `sh -c 'unset ANTHROPIC_BASE_URL'`);

  // Restart gateway to pick up new credentials
  await restartGateway(appName, machineId);
}
```

---

### Phase 1C: Entrypoint Changes (~0.5 day)

Update `entrypoint.sh` to support direct-to-Anthropic mode:

```bash
# If BYOK mode, don't set ANTHROPIC_BASE_URL (let OpenClaw talk directly to Anthropic)
# If legacy/grace period, keep routing through our proxy
if [ "${BYOK_MODE}" = "true" ]; then
  echo "[automna] BYOK mode: LLM calls go direct to Anthropic"
  # Don't set ANTHROPIC_BASE_URL — defaults to api.anthropic.com
  # Don't set automna provider in config for LLM
else
  echo "[automna] Legacy mode: LLM calls route through Automna proxy"
  export ANTHROPIC_BASE_URL="$AUTOMNA_PROXY_URL/api/llm"
fi
```

Update config merge in entrypoint:
- BYOK mode: set `model.primary` to `anthropic/claude-opus-4-5` (direct provider)
- Legacy mode: keep `automna/claude-opus-4-5` (proxy provider)

---

### Phase 1D: Feature Gating (~1 day)

```typescript
// lib/feature-gates.ts

export function canUsePhone(plan: PlanType): boolean {
  return plan === 'pro' || plan === 'power';
}

export function canUseCron(plan: PlanType): boolean {
  return plan === 'pro' || plan === 'power';
}

export function canUseApi(plan: PlanType): boolean {
  return plan === 'power';
}

export function getMaxChannels(plan: PlanType): number {
  return PLAN_LIMITS[plan].maxChannels;
}

export function shouldSleepWhenIdle(plan: PlanType): boolean {
  return PLAN_LIMITS[plan].sleepWhenIdle;
}
```

**Enforcement points:**

| Feature | Where | How |
|---|---|---|
| Phone calling | `/api/user/call/route.ts` | Check `canUsePhone(plan)` before initiating |
| Cron/scheduled | OpenClaw config on machine | Strip heartbeat/cron config for Starter |
| Channel limit | Provision + integrations panel | Count active channels, block at limit |
| API access | New `/api/v1/*` routes | Auth middleware checks `canUseApi(plan)` |
| Sleep when idle | Fly machine config | Auto-stop on Starter machines |
| File browser | Dashboard component | Hide/disable for Starter |

---

### Phase 1E: Non-LLM Service Caps (~0.5 day)

```typescript
// New: /api/_lib/service-limits.ts

export async function checkServiceLimit(
  userId: string,
  service: 'search' | 'browser' | 'email' | 'phone',
  plan: PlanType
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = {
    starter: { search: 500, browser: 60, email: 100, phone: 0 },
    pro:     { search: 2000, browser: 300, email: 500, phone: 60 },
    power:   { search: 10000, browser: 1000, email: 2000, phone: 120 },
  };

  const monthStart = getMonthStart();
  const used = await getServiceUsageThisMonth(userId, service, monthStart);
  const limit = limits[plan][service];

  return { allowed: used < limit, used, limit };
}
```

---

## Workstream 2: Migration

### Step 1: Prep (~0.5 day)

1. Create new Stripe products/prices ($20/$30/$40)
2. Create migration announcement in announcements table
3. Write migration email template

### Step 2: Plan Mapping

```typescript
const PLAN_MAP = {
  'free':     'starter',   // Free → Starter (need to subscribe)
  'lite':     'starter',   // $20 → $20 (same price, new name)
  'starter':  'pro',       // $79 → $30 (price drop!)
  'pro':      'power',     // $149 → $40 (price drop!)
  'business': 'power',     // $299 → $40 (price drop!)
};
```

### Step 3: Migration Flow

For each existing paying user:

1. **Update Stripe subscription** — switch to new price ID (prorate)
2. **Update plan** in Clerk + Turso
3. **Show BYOK setup prompt** — announcement modal on next login
4. **30-day grace period** — keep routing LLM through our Anthropic key
5. **After 30 days** — agent stops LLM calls with clear error prompting credential setup
6. **Reminder emails** at day 7, 14, 21, 28

### Step 4: Migration Email

```
Subject: Your Automna plan just got cheaper ✨

Hey {name},

We're simplifying Automna pricing. Your plan is changing:

  {old_plan} ${old_price}/mo → {new_plan} ${new_price}/mo

The one change: you'll connect your own Claude account for AI usage.
This means no caps from us — unlimited AI, powered by your subscription.

→ Connect now: https://automna.ai/dashboard?setup=byok

You have 30 days to connect. Your agent keeps working in the meantime.

Questions? Reply to this email.
```

### Step 5: Cleanup (after grace period)

- Remove old Stripe products
- Remove credit/budget billing code
- Remove LLM proxy route
- Clean up `UsageBanner` component

---

## Workstream 3: New User Onboarding

### Flow
```
Landing → Pick plan → Stripe checkout → Connect AI → Provision → Pick channel → Dashboard
```

### Screen 1: Pricing Page

Three cards: Starter / Pro / Power at $20 / $30 / $40.
Feature comparison matrix (see PRICING-BYOK-PIVOT.md).
No references to credits, tokens, or included compute.
Messaging: "Bring your own Claude account. We handle everything else."

### Screen 2: Connect Your AI (`/setup/connect`)

**Main choice:**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Connect your AI                                        │
│                                                         │
│  Choose how to power your agent:                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ⭐ RECOMMENDED — BEST VALUE                    │   │
│  │                                                  │   │
│  │  Use your Claude subscription                    │   │
│  │                                                  │   │
│  │  Already have Claude Pro ($20/mo) or Max?        │   │
│  │  Your agent uses it directly — no extra AI       │   │
│  │  costs from Automna.                             │   │
│  │                                                  │   │
│  │  [Connect with Claude Code →]                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Use an API key                                  │   │
│  │                                                  │   │
│  │  Pay-per-use through Anthropic's API.            │   │
│  │  Costs can add up quickly — heavy use with Opus  │   │
│  │  can run $100-500+/mo.                           │   │
│  │  Best for developers who want direct control.    │   │
│  │                                                  │   │
│  │  [Use API Key →]                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Claude Code path (after clicking "Connect with Claude Code"):**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Connect your Claude subscription                       │
│                                                         │
│  This takes about 60 seconds.                           │
│                                                         │
│  ① Open your terminal                                   │
│                                                         │
│  ② If you don't have Claude Code yet:                   │
│                                                         │
│     npm install -g @anthropic-ai/claude-code            │
│                                              [Copy 📋]  │
│                                                         │
│  ③ Run this command:                                    │
│                                                         │
│     claude setup-token                                  │
│                                              [Copy 📋]  │
│                                                         │
│     It will open your browser to sign in with           │
│     Anthropic, then display a token starting with       │
│     sk-ant-oat01-...                                    │
│                                                         │
│  ④ Paste your token here:                               │
│                                                         │
│     ┌───────────────────────────────────────────┐      │
│     │                                           │      │
│     └───────────────────────────────────────────┘      │
│                                                         │
│     [Validate & Continue →]                             │
│                                                         │
│  ─────────────────────────────────────────────────      │
│  💡 Your agent runs on your Claude subscription.        │
│     No extra AI costs. No usage caps from Automna.      │
│                                                         │
│  ← Back                                                │
└─────────────────────────────────────────────────────────┘
```

**API key path (after clicking "Use API Key"):**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Connect with API Key                                   │
│                                                         │
│  ⚠️ Heads up: API keys use pay-per-use pricing from    │
│  Anthropic. Costs vary widely — light use may be        │
│  $20/mo, but heavy use with Claude Opus can run         │
│  $100-500+/mo.                                          │
│                                                         │
│  For predictable costs, use your Claude Pro ($20/mo)    │
│  or Max subscription instead. [Switch to Claude →]      │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│  ① Go to console.anthropic.com/settings/keys           │
│                                     [Open Console ↗]    │
│                                                         │
│  ② Create a new API key                                 │
│                                                         │
│  ③ Paste it here:                                       │
│                                                         │
│     ┌───────────────────────────────────────────┐      │
│     │                                           │      │
│     └───────────────────────────────────────────┘      │
│                                                         │
│     [Validate & Continue →]                             │
│                                                         │
│  ← Back                                                │
└─────────────────────────────────────────────────────────┘
```

### Screen 3: Provisioning (`/setup/provision`)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Setting up your agent...                               │
│                                                         │
│  ████████████████░░░░  75%                              │
│                                                         │
│  ✅ Account created                                     │
│  ✅ Credentials validated                               │
│  ✅ Deploying your agent                                │
│  ⏳ Connecting services...                              │
│                                                         │
│  This takes about 60 seconds.                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Provisioning creates the Fly app + machine, pushes credentials to the machine, and starts the gateway.

Phone number provisioned only for Pro+ tiers.

### Screen 4: Channel Setup (`/setup/channel`)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Connect a channel                                      │
│                                                         │
│  How do you want to talk to your agent?                 │
│                                                         │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐               │
│  │  💬  │  │  📱  │  │  🟢  │  │  🌐  │               │
│  │Discord│  │Telegm│  │WhtsAp│  │ Web  │               │
│  └──────┘  └──────┘  └──────┘  └──────┘               │
│                                                         │
│  You can add more channels later.                       │
│  (Starter: 1 | Pro: 3 | Power: unlimited)              │
│                                                         │
│  [Skip for now → Go to Dashboard]                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Screen 5: Dashboard Updates

**Settings panel (`SettingsPanel.tsx`):**
- New "AI Connection" section showing:
  - Connection type (Claude subscription / API key)
  - Masked credential + status (✅ Valid / ⚠️ Expired)
  - "Change" / "Disconnect" buttons
  - Last validated timestamp

**Usage banner (`UsageBanner.tsx`):**
- Remove credit bar entirely
- Show service usage:
  ```
  Pro Plan • Claude Connected ✅
  Search: 45/2,000 | Browser: 12/300 min | Email: 8/500 | Phone: 5/60 min
  ```

**Integrations panel:**
- Enforce channel limits per tier
- Show upgrade prompt when limit reached

---

## Implementation Order

```
Day 1:  Schema changes + PLAN_LIMITS update + Stripe products
Day 2:  BYOK credential management API + secrets integration
Day 3:  Entrypoint changes (direct-to-Anthropic) + credential push to machines
Day 4:  Feature gating (phone, cron, channels) + service caps
Day 5:  New onboarding flow (pricing page + connect AI + setup wizard)
Day 6:  Migration script + announcement + email
Day 7:  Dashboard updates (settings, usage banner, integrations)

Post-launch:  Remove legacy LLM proxy code + credit billing
```

### What Can Ship Incrementally

1. **Credential management + direct-to-Anthropic** (Days 1-3) — new users can onboard
2. **Feature gating** (Day 4) — enforce tier differences
3. **New onboarding** (Day 5) — replace old signup flow
4. **Migration** (Day 6) — move existing users over
5. **Dashboard polish** (Day 7) — updated UI

---

## Files to Modify

| File | Changes |
|---|---|
| `src/lib/db/schema.ts` | New PLAN_LIMITS, byok columns on machines |
| `src/app/api/checkout/route.ts` | New price IDs for $20/$30/$40 |
| `src/app/api/webhooks/stripe/route.ts` | Handle new plan names, remove machine scaling |
| `src/app/api/user/provision/route.ts` | Starter = no phone, auto-stop, push credentials |
| `src/app/api/user/call/route.ts` | Gate to Pro+ |
| `src/app/pricing/page.tsx` | New 3-tier pricing |
| `src/app/page.tsx` | Update landing page pricing section |
| `src/components/UsageBanner.tsx` | Service usage instead of credits |
| `src/components/SettingsPanel.tsx` | AI connection management UI |
| `src/components/IntegrationsPanel.tsx` | Channel limits |
| `docker/entrypoint.sh` | BYOK mode: direct-to-Anthropic, skip LLM proxy |
| **New files:** | |
| `src/app/api/user/byok/route.ts` | Credential CRUD + push to machine |
| `src/app/api/_lib/service-limits.ts` | Non-LLM service caps |
| `src/lib/feature-gates.ts` | Tier feature checks |
| `src/app/setup/connect/page.tsx` | BYOK onboarding — main choice |
| `src/app/setup/connect/claude/page.tsx` | Claude Code setup-token flow |
| `src/app/setup/connect/apikey/page.tsx` | API key flow |
| `src/app/setup/provision/page.tsx` | Provisioning progress |
| `src/app/setup/channel/page.tsx` | Channel selection |
| `scripts/migrate-plans.ts` | Migration script |
| **Remove/deprecate:** | |
| `src/app/api/llm/v1/messages/route.ts` | No longer needed (post-migration cleanup) |
| `src/app/api/llm/_lib/rate-limit.ts` | LLM rate limiting removed |
| `src/app/api/llm/_lib/usage.ts` | LLM usage billing removed |

---

## Risks & Rollback

| Risk | Mitigation |
|---|---|
| Users struggle with `claude setup-token` | Clear step-by-step UI, copy buttons, API key fallback |
| Migration breaks Stripe subscriptions | Test on single user first. Keep old prices active. |
| Users don't connect in 30 days | Reminder emails at day 7, 14, 21, 28 |
| Credential push to machine fails | Retry logic, manual fix via Fly SSH |
| Feature gating breaks existing workflows | Soft-enforce first (warn, don't block) for 1 week |
| Setup token expires | OpenClaw handles refresh internally. Dashboard polls health. |

**Rollback plan:** Old Stripe products stay active. If pivot fails, revert plan mapping and re-enable LLM proxy. No data deleted during migration.

---

## Open Technical Questions

1. **Fly auto-stop for Starter** — Does the Machines API support auto-stop per machine, or only via fly.toml?
2. **Credential push reliability** — `fly ssh console` vs Machines API exec for writing auth-profiles.json. Need to test which is more reliable.
3. **Cron gating** — How to disable heartbeat/cron on Starter machines? Strip from OpenClaw config at provision time.
4. **Channel counting** — Where's the source of truth for "active channels"? Need to track in DB.
5. **Grace period** — Flag in machines table? Separate `migration_deadline` column?
6. **Setup token refresh** — Does OpenClaw auto-refresh `sk-ant-oat01-` tokens? If not, what happens when they expire?
