# BYOK Pivot — Implementation Plan

> **Date:** 2026-02-12
> **Status:** Planning
> **Companion doc:** `PRICING-BYOK-PIVOT.md` (tier structure + cost analysis)

---

## Overview

Three workstreams:
1. **Backend changes** — new tiers, BYOK auth, feature gating
2. **Migration** — move existing users to new tiers
3. **Onboarding flow** — new user signup experience

Estimated total effort: **5-7 days** (can ship incrementally)

---

## Workstream 1: Backend Changes

### Phase 1A: Schema & Tier Changes (~1 day)

**Database (Turso):**

```sql
-- Add BYOK columns to machines table
ALTER TABLE machines ADD COLUMN byok_provider TEXT;          -- 'anthropic' | null
ALTER TABLE machines ADD COLUMN byok_enabled INTEGER DEFAULT 0;

-- Add feature flags based on tier
-- (No schema change needed — we gate in code based on plan column)
```

The API key itself gets stored in the existing `secrets` table (already has AES-256-GCM encryption):
```sql
-- Use existing secrets table
-- name = 'anthropic_api_key', encrypted value stored
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
    monthlyCallMinutes: 0,         // No phone on Starter
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
    maxChannels: -1,               // Unlimited
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

Update `PRICES` in `checkout/route.ts` and env vars.

---

### Phase 1B: BYOK API Key Management (~1 day)

**New API routes:**

```
POST   /api/user/byok         — Save API key (encrypt + store in secrets table)
DELETE /api/user/byok         — Remove API key
GET    /api/user/byok/status  — Check BYOK status (enabled, key valid, last validated)
POST   /api/user/byok/test    — Validate key against Anthropic API
```

**Implementation (`/api/user/byok/route.ts`):**

```typescript
// POST: Save key
export async function POST(req: Request) {
  const { userId } = await auth();
  const { apiKey } = await req.json();

  // 1. Validate format
  if (!apiKey.startsWith('sk-ant-api')) {
    return error(400, 'Invalid Anthropic API key format');
  }

  // 2. Test key against Anthropic (lightweight call)
  const valid = await testAnthropicKey(apiKey);
  if (!valid) return error(400, 'API key is invalid or expired');

  // 3. Encrypt and store in secrets table
  await upsertSecret(userId, 'anthropic_api_key', apiKey);

  // 4. Enable BYOK on machine
  await db.update(machines)
    .set({ byokEnabled: 1, byokProvider: 'anthropic', updatedAt: new Date() })
    .where(eq(machines.userId, userId));

  return Response.json({ status: 'ok', byokEnabled: true });
}
```

**Key validation helper:**
```typescript
async function testAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    return res.ok || res.status === 400; // 400 = valid key, bad request is fine
  } catch {
    return false;
  }
}
```

---

### Phase 1C: Direct-to-Anthropic Architecture (~0.5 day)

**No LLM proxy.** User's OpenClaw machine talks directly to Anthropic with their own key.

```
LLM calls:      OpenClaw → Anthropic (direct, user's key/OAuth)
Service calls:   OpenClaw → Our proxies (search, browser, email, phone)
```

**On the user's Fly machine:**

```bash
# API key mode:
ANTHROPIC_API_KEY=sk-ant-api03-...
# No ANTHROPIC_BASE_URL (defaults to api.anthropic.com)

# OAuth mode (future):
# OAuth token injected, OpenClaw uses it directly
```

**What this means:**
- Zero latency overhead on LLM calls
- OAuth works naturally (token on machine, direct to Anthropic)
- No LLM proxy to scale or maintain
- User sees Anthropic errors directly (expired key, quota exceeded, etc.)
- Non-LLM proxies stay as-is (Browserbase, Perplexity, Bland — our API keys, our costs)

**How the key gets to the machine:**

During onboarding or key update:
1. User enters API key in dashboard
2. Dashboard validates key against Anthropic
3. Dashboard encrypts + stores key in secrets table (for backup/recovery)
4. Dashboard pushes key to user's Fly machine via SSH or Machines API:
   ```typescript
   // Update machine env var
   await flyApi.updateMachineEnv(machineId, {
     ANTHROPIC_API_KEY: decryptedKey,
   });
   // Restart machine to pick up new env
   await flyApi.restartMachine(machineId);
   ```

**Analytics:** OpenClaw logs usage locally. Dashboard can pull stats from machines via gateway API for usage display. Not in the critical path.

**Bad key handling:** When Anthropic returns 401, the user sees the error in chat. Dashboard can poll machine health periodically and show a banner prompting key update.

**What we remove:**
- `/api/llm/v1/messages/route.ts` — no longer needed for BYOK users
- `/api/llm/_lib/rate-limit.ts` — LLM rate limiting removed (Anthropic handles their own)
- `/api/llm/_lib/auth.ts` — gateway token auth for LLM proxy removed
- `/api/llm/_lib/usage.ts` — LLM usage logging from proxy removed
- Credit budget system — fully removed

**What we keep:**
- Non-LLM proxy routes (Browserbase, search, email, phone)
- Service usage caps (enforced in those proxy routes)
- Gateway token auth (still used for non-LLM proxies + dashboard API)

**Future: Paid compute add-on**
If we ever want to sell overage compute, it would be a manual opt-in:
User runs out of Claude tokens → dashboard offers "Buy compute" → user accepts →
machine config switches to our proxy URL + our key → metered billing kicks in.
This is a future feature, not MVP. Architecture doesn't need to support it now.

---

### Phase 1D: Feature Gating (~1 day)

New middleware/helper to enforce tier-specific features:

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

**Where to enforce:**

| Feature | Enforcement Point | How |
|---|---|---|
| Phone calling | `/api/user/call/route.ts` | Check `canUsePhone(plan)` before initiating |
| Cron/scheduled | OpenClaw config on machine | Don't include heartbeat/cron config for Starter |
| Channel limit | Provision + integrations panel | Count active channels, block if at limit |
| API access | New `/api/v1/*` routes | Auth middleware checks `canUseApi(plan)` |
| Sleep when idle | Fly machine config | Set auto-stop on Starter machines |
| File browser | Dashboard component | Hide/disable for Starter |

**Fly auto-stop for Starter tier:**

```typescript
// In provision/route.ts, when creating machine for Starter:
const machineConfig = {
  ...baseConfig,
  auto_destroy: false,
  services: [{
    ...baseServices,
    // Auto-stop after 30 min idle
    auto_stop_machines: "stop",
    auto_start_machines: true,
    min_machines_running: 0,
  }],
};
```

---

### Phase 1E: Non-LLM Service Caps (~0.5 day)

Since we no longer bill for LLM, we need per-service caps:

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

Apply in each proxy route:
- `/api/user/call/route.ts` — phone minutes
- `/api/browserbase/v1/[...path]/route.ts` — browser minutes
- Search proxy — search count
- `/api/user/email/send/route.ts` — email count

---

## Workstream 2: Migration

### Step 1: Prep (~0.5 day)

1. Create new Stripe products/prices ($20/$30/$40)
2. Create migration announcement in announcements table
3. Write migration email template

### Step 2: Plan Mapping Script (~0.5 day)

```typescript
// scripts/migrate-plans.ts

const PLAN_MAP = {
  'free':     'starter',   // Free → Starter (they'll need to subscribe)
  'lite':     'starter',   // $20 → $20 (same price, new name)
  'starter':  'pro',       // $79 → $30 (price drop!)
  'pro':      'power',     // $149 → $40 (price drop!)
  'business': 'power',     // $299 → $40 (price drop!)
};
```

### Step 3: Migration Flow

**For each existing paying user:**

1. **Update Stripe subscription** — switch to new price ID
   ```typescript
   // Prorate remaining balance
   await stripe.subscriptions.update(subId, {
     items: [{ id: itemId, price: newPriceId }],
     proration_behavior: 'always_invoice', // Credit them immediately
   });
   ```

2. **Update plan in Clerk + Turso** — `machines.plan = newPlan`

3. **Show BYOK setup prompt** — announcement modal on next login:
   > "Your plan has been updated to [Pro] at $30/mo (down from $79!)
   > To continue using your agent, connect your Anthropic account.
   > You have 30 days before this is required."

4. **Grace period** — for 30 days, keep routing through our Anthropic key
   ```typescript
   // In LLM proxy, during grace period:
   if (!auth.byokEnabled && isInGracePeriod(auth.userId)) {
     anthropicKey = ANTHROPIC_API_KEY; // Our key, temporarily
     isByok = false;
   }
   ```

5. **After 30 days** — if no key added, agent stops responding to LLM requests with a clear error prompting key setup

### Step 4: Migration Email

```
Subject: Your Automna plan just got cheaper ✨

Hey {name},

We're simplifying Automna pricing. Your plan is changing:

  {old_plan} ${old_price}/mo → {new_plan} ${new_price}/mo

The one change: you'll connect your own Anthropic account for AI usage.
This means no caps from us — unlimited AI, powered by your own key.

→ Connect your key: https://automna.ai/dashboard?setup=byok

You have 30 days to connect. Your agent keeps working in the meantime.

Questions? Reply to this email.
```

### Step 5: Cleanup (~after grace period)

- Remove old Stripe products
- Remove credit/budget billing code
- Remove `monthlyAutomnaCredits` from PLAN_LIMITS
- Remove `getUsedAutomnaCredits()` calls from LLM proxy
- Clean up `UsageBanner` component (no more credit bar)

---

## Workstream 3: New User Onboarding

### Current Flow
```
Landing → Pick plan → Stripe checkout → Provision machine → Dashboard
```

### New Flow
```
Landing → Pick plan → Stripe checkout → Connect AI key → Provision machine → Pick channel → Dashboard
```

### Screen-by-Screen

#### 1. Pricing Page (update `pricing/page.tsx`)

Three cards: Starter / Pro / Power at $20 / $30 / $40.
Feature comparison matrix (see PRICING-BYOK-PIVOT.md).
CTA buttons go to Stripe checkout.

Remove all references to credits, tokens, included compute.
New messaging: "Bring your own Anthropic account. We handle everything else."

#### 2. Post-Checkout: Connect AI (`/setup/connect`)

New page. User lands here after successful Stripe checkout.

```
┌─────────────────────────────────────────────┐
│  Step 1 of 3: Connect your AI              │
│                                             │
│  Your agent needs an Anthropic account      │
│  to think. Connect yours:                   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  🔑 Paste your API key              │   │
│  │  ┌───────────────────────────────┐  │   │
│  │  │ sk-ant-api03-...              │  │   │
│  │  └───────────────────────────────┘  │   │
│  │  [Validate & Continue]              │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Don't have a key?                          │
│  → Get one at console.anthropic.com         │
│    (takes 2 minutes)                        │
│                                             │
│  ─── or ───                                 │
│                                             │
│  [Sign in with Claude] (coming soon)        │
│                                             │
└─────────────────────────────────────────────┘
```

**API key inline guide:**
1. Go to console.anthropic.com → API Keys
2. Click "Create Key"
3. Copy and paste it above

On successful validation → proceed to Step 2.

#### 3. Provisioning (`/setup/provision`)

```
┌─────────────────────────────────────────────┐
│  Step 2 of 3: Setting up your agent...      │
│                                             │
│  ████████████░░░░░░  60%                    │
│                                             │
│  ✅ Account created                         │
│  ✅ API key validated                       │
│  ⏳ Deploying your agent...                 │
│  ○ Connecting services                      │
│                                             │
│  This takes about 60 seconds.               │
└─────────────────────────────────────────────┘
```

Same provisioning logic as today, minus phone number for Starter tier.

#### 4. Channel Setup (`/setup/channel`)

```
┌─────────────────────────────────────────────┐
│  Step 3 of 3: Connect a channel             │
│                                             │
│  How do you want to talk to your agent?     │
│                                             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│  │ 💬   │ │ 📱   │ │ 🔵   │ │ 🌐   │      │
│  │Discrd│ │Telegm│ │WhtsAp│ │ Web  │      │
│  └──────┘ └──────┘ └──────┘ └──────┘      │
│                                             │
│  You can add more channels later.           │
│  (Starter: 1 channel | Pro: 3 | Power: ∞)  │
│                                             │
│  [Skip for now → Go to Dashboard]           │
└─────────────────────────────────────────────┘
```

#### 5. Dashboard Updates

**Settings panel (`SettingsPanel.tsx`):**
- Add "API Key" section showing masked key + status
- "Change Key" / "Remove Key" buttons
- Show which model they're using

**Usage banner (`UsageBanner.tsx`):**
- Remove credit bar
- Show service usage instead:
  ```
  Pro Plan • BYOK Active
  Search: 45/2,000 | Browser: 12/300 min | Email: 8/500 | Phone: 5/60 min
  ```

**Integrations panel:**
- Enforce channel limits per tier
- Show upgrade prompt when limit reached

---

## Implementation Order (Recommended)

```
Day 1:  Schema changes + PLAN_LIMITS update + Stripe products
Day 2:  BYOK API routes + key management + secrets integration
Day 3:  LLM proxy BYOK routing + rate limit changes
Day 4:  Feature gating (phone, cron, channels) + service caps
Day 5:  New onboarding flow (pricing page + connect key + setup wizard)
Day 6:  Migration script + announcement + email
Day 7:  Dashboard updates (settings, usage banner, integrations)

Post-launch:  Claude OAuth research + implementation (if feasible)
Post-launch:  Remove legacy credit/billing code
```

### What Can Ship Incrementally

1. **BYOK support** (Days 1-3) can ship first — existing users can optionally add keys
2. **Feature gating** (Day 4) ships with new tier names
3. **Migration** (Day 6) triggers the actual plan switchover
4. **New onboarding** (Day 5) replaces the old flow

---

## Files to Modify

| File | Changes |
|---|---|
| `src/lib/db/schema.ts` | New PLAN_LIMITS, add byok columns to machines |
| `src/app/api/llm/v1/messages/route.ts` | Remove or deprecate (no longer needed for BYOK) |
| `src/app/api/llm/_lib/auth.ts` | Keep for non-LLM proxy auth only |
| `src/app/api/llm/_lib/rate-limit.ts` | Remove LLM rate limiting (keep service caps) |
| `src/app/api/checkout/route.ts` | New price IDs |
| `src/app/api/webhooks/stripe/route.ts` | Handle new plan names, remove scaling logic |
| `src/app/api/user/provision/route.ts` | Starter = no phone, auto-stop config |
| `src/app/api/user/call/route.ts` | Gate to Pro+ |
| `src/app/pricing/page.tsx` | New 3-tier pricing |
| `src/app/page.tsx` | Update landing page pricing section |
| `src/components/UsageBanner.tsx` | Service usage instead of credits |
| `src/components/SettingsPanel.tsx` | API key management UI |
| `src/components/IntegrationsPanel.tsx` | Channel limits |
| **New files:** | |
| `src/app/api/user/byok/route.ts` | BYOK key CRUD |
| `src/app/api/_lib/service-limits.ts` | Non-LLM service caps |
| `src/lib/feature-gates.ts` | Tier feature checks |
| `src/app/setup/connect/page.tsx` | BYOK onboarding step |
| `src/app/setup/channel/page.tsx` | Channel selection step |
| `scripts/migrate-plans.ts` | Migration script |

---

## Risks & Rollback

| Risk | Mitigation |
|---|---|
| Migration breaks Stripe subscriptions | Test on single user first. Keep old prices active. |
| Users don't add keys in 30 days | Send reminder emails at day 7, 14, 21, 28 |
| API key validation false negatives | Generous retry logic, clear error messages |
| Feature gating breaks existing workflows | Soft-enforce first (warn, don't block) for 1 week |
| Claude OAuth not available | API key is the default. OAuth is a nice-to-have. |

**Rollback plan:** Old Stripe products stay active. If pivot fails, revert plan mapping and re-enable credit system. No data is deleted during migration.

---

## Open Technical Questions

1. **Fly auto-stop for Starter** — Does the Fly Machines API support auto-stop on individual machines, or only via fly.toml? Need to test.
2. **Claude Code OAuth** — What's the actual OAuth flow? Is there a public client ID? Needs research before we can commit to this.
3. **Cron gating** — How do we disable heartbeat/cron on Starter machines? Strip it from OpenClaw config at provision time?
4. **Channel counting** — Where's the source of truth for "active channels"? Need to track in DB.
5. **Grace period implementation** — Flag in machines table? Separate `migration_deadline` column?
