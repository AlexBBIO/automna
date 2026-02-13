# BYOK (Bring Your Own Key) System Specification

*Created: 2026-02-08*
*Updated: 2026-02-13*
*Status: DEPLOYED — Testing on prod*

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Design Goals](#2-design-goals)
3. [Option Analysis](#3-option-analysis)
4. [Recommended Architecture: Tiered BYOK](#4-recommended-architecture-tiered-byok)
5. [Plan Structure](#5-plan-structure)
6. [Technical Implementation](#6-technical-implementation)
7. [Overage Handling](#7-overage-handling)
8. [UX Flow](#8-ux-flow)
9. [Security Considerations](#9-security-considerations)
10. [Migration Path](#10-migration-path)
11. [Open Questions](#11-open-questions)

---

## 1. Problem Statement

Right now, **every plan includes Anthropic API costs** baked into the price. This creates
two problems:

1. **Price barrier:** Users who already have Anthropic API keys are paying twice for LLM
   access (once to us, once to Anthropic).
2. **Margin risk:** Heavy users on Business tier can generate losses (cost analysis shows
   heavy Business users cost $520 vs $299 revenue = -$221 loss).
3. **No low-cost entry point:** The cheapest plan is $79/month, which is steep for users
   who just want hosting and are happy to pay Anthropic directly.

BYOK solves all three: users bring their own Anthropic API key, we route their LLM traffic
through it, and we charge less because we're not eating the API cost.

---

## 2. Design Goals

- **Simple for users:** One toggle, not a complex matrix of options
- **No margin risk on LLM:** BYOK users pay Anthropic directly for all LLM usage
- **Preserve our value:** We still charge meaningfully for hosting, integrations, tools
- **Graceful transitions:** Users can switch between BYOK and included tokens
- **Don't break existing billing:** Automna Token system still works, just with different budgets

---

## 3. Option Analysis

### Option A: BYOK-Only Lowest Tier

Add a new cheap tier ($29-39/month) that **requires** BYOK. Higher tiers stay as-is.

**Pros:** Simple, clear positioning, one new product
**Cons:** Higher tiers don't benefit, no overage solution for existing users

### Option B: BYOK Variant for Every Tier

Each plan comes in two flavors: "Included" (current) and "BYOK" (cheaper, bring your key).

**Pros:** Maximum flexibility, every price point covered
**Cons:** Doubles the pricing page complexity, confusing for users

### Option C: BYOK as Add-On / Override

Every plan has included tokens as baseline. Users can optionally add their own API key to:
(a) get a discount, or (b) handle overages beyond the included budget.

**Pros:** One plan lineup, optional upgrade, handles overages naturally
**Cons:** More complex billing logic

### Option D: Tiered BYOK (Recommended)

Three-part approach:
1. **New "Lite" tier** ($29/mo) that requires BYOK — no included LLM tokens
2. **Existing tiers keep included budgets** but users can optionally add BYOK
3. **BYOK handles overages** on all tiers — instead of hitting a wall, switch to own key

**Pros:** Clear entry point, existing tiers work as before, overages handled elegantly
**Cons:** Slightly more complex than A, but much cleaner than B

---

## 4. Recommended Architecture: Tiered BYOK

### The Model

```
                    Lite ($20)       Starter ($79)      Pro ($149)      Business ($299)
                    ──────────       ─────────────      ─────────       ────────────────
Credits             50K              200K included       1M included     5M included
BYOK Option         Optional         Optional            Optional        Optional
Overage via BYOK    ✅ Yes           ✅ Yes              ✅ Yes          ✅ Yes
Integrations        All              All                 All             All
Phone Calls         30 min           60 min              120 min         300 min
Browser             ✅               ✅                  ✅              ✅
Email               ✅               ✅                  ✅              ✅
Memory              ✅               ✅                  ✅              ✅
Machine             Sleeps idle      Always-on           Always-on       Always-on
```

### How It Works

**Without BYOK (Starter/Pro/Business):**
Same as today. LLM traffic routes through our proxy, we pay Anthropic, user's Automna
Token budget gets consumed.

**With BYOK (any tier):**
- LLM traffic routes through the user's own API key
- LLM requests **do not count** against Automna Token budget
- Non-LLM services (calls, email, search, browser) still count against budget
- User pays Anthropic directly for all LLM usage

**Lite tier (BYOK mandatory):**
- No included LLM budget at all
- API key required during onboarding
- All other platform features work normally
- Non-LLM usage has a small included budget (50K Automna Tokens = $5 of
  calls/search/browser/email)

---

## 5. Plan Structure

### Updated Plan Lineup

| Plan | Price | Credits | Non-LLM Budget (BYOK) | BYOK | Key Features |
|------|-------|---------|----------------------|------|-------------|
| **Lite** | $20/mo | 50K ($5) | 50K ($5) | Optional | Full agent, all integrations, browser, phone, email. Machine sleeps when idle. |
| **Starter** | $79/mo | 200K ($20) | 50K ($5) | Optional | Everything in Lite + always-on 24/7, proactive monitoring, long-term memory. |
| **Pro** | $149/mo | 1M ($100) | 100K ($10) | Optional | Everything in Starter + higher rate limits, custom skills, email support. |
| **Business** | $299/mo | 5M ($500) | 200K ($20) | Optional | Everything in Pro + highest rate limits, API access, analytics, dedicated support. |

### What BYOK Changes Per Tier

| Tier | Without BYOK | With BYOK |
|------|-------------|-----------|
| **Lite** | 50K credits total budget | LLM unlimited (own key), 50K credits for non-LLM |
| **Starter** | 200K credits total budget | LLM unlimited (own key), 50K credits for non-LLM |
| **Pro** | 1M credits total budget | LLM unlimited (own key), 100K credits for non-LLM |
| **Business** | 5M credits total budget | LLM unlimited (own key), 200K credits for non-LLM |

When BYOK is active, the Automna Credit budget only covers non-LLM services. Since non-LLM
costs are small (search: 30 credits, email: 20 credits, browser: 200 credits/session), even the 50K
non-LLM budget is generous for most users.

### Stripe Products

| Product | Price ID | Amount |
|---------|----------|--------|
| Lite | `price_xxx` (new) | $20/mo |
| Starter | `price_1Sukg0...` (existing) | $79/mo |
| Pro | `price_1SukgA...` (existing) | $149/mo |
| Business | `price_1SukgB...` (existing) | $299/mo |

---

## 6. Technical Implementation

### 6a. API Key Storage

User's Anthropic API key must be stored **encrypted** in Turso:

```sql
ALTER TABLE users ADD COLUMN byok_api_key_encrypted TEXT;
ALTER TABLE users ADD COLUMN byok_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN byok_provider TEXT DEFAULT 'anthropic';
```

Encryption: AES-256-GCM with a server-side key stored in Vercel env vars.

```typescript
// landing/src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.BYOK_ENCRYPTION_KEY!; // 32-byte hex string

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(encHex, 'hex', 'utf8') + decipher.final('utf8');
}
```

### 6b. API Key Management Endpoints

```
POST   /api/user/byok         — Set/update API key
DELETE /api/user/byok         — Remove API key (revert to included tokens)
GET    /api/user/byok/status  — Check if BYOK is active, key validity
POST   /api/user/byok/test    — Validate key against Anthropic API
```

**Set key:**
```typescript
// POST /api/user/byok
// Body: { apiKey: "sk-ant-api03-..." }
export async function POST(req: Request) {
  const { userId } = await auth();
  const { apiKey } = await req.json();

  // 1. Validate format
  if (!apiKey.startsWith('sk-ant-api')) {
    return Response.json({ error: 'Invalid Anthropic API key format' }, { status: 400 });
  }

  // 2. Test key against Anthropic
  const testResult = await testAnthropicKey(apiKey);
  if (!testResult.valid) {
    return Response.json({ error: 'API key is invalid or expired', details: testResult.error }, { status: 400 });
  }

  // 3. Encrypt and store
  const encrypted = encrypt(apiKey);
  await db.update(users)
    .set({ byokApiKeyEncrypted: encrypted, byokEnabled: 1 })
    .where(eq(users.clerkId, userId));

  // 4. Update machine config to use BYOK
  await updateMachineForByok(userId, true);

  return Response.json({ status: 'ok', byokEnabled: true });
}
```

### 6c. LLM Proxy Changes

The LLM proxy (`/api/llm/v1/messages`) needs to handle two modes:

```typescript
// landing/src/app/api/llm/v1/messages/route.ts

export async function POST(req: Request) {
  const authResult = await validateGatewayToken(req);
  const user = await getUser(authResult.userId);
  const plan = user.plan;

  // Determine which API key to use
  let apiKey: string;
  let isByok: boolean;

  if (user.byokEnabled && user.byokApiKeyEncrypted) {
    // BYOK mode: use user's own key
    apiKey = decrypt(user.byokApiKeyEncrypted);
    isByok = true;
  } else {
    // Included mode: use our key
    apiKey = process.env.ANTHROPIC_API_KEY!;
    isByok = false;
  }

  // Rate limit check
  if (!isByok) {
    // Standard rate limiting against Automna Token budget
    const rateCheck = await checkRateLimits(user);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck);
  } else {
    // BYOK: only check non-LLM budget and RPM limits
    const rpmCheck = await checkRpmOnly(user);
    if (!rpmCheck.allowed) return rateLimitResponse(rpmCheck);
  }

  // Forward to Anthropic with the chosen key
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: await req.text(),
  });

  // Usage logging
  // ... (extract tokens from response as before)

  if (isByok) {
    // BYOK: log for tracking but DON'T count against budget
    logUsageEventBackground({
      userId: user.clerkId,
      eventType: 'llm',
      costMicrodollars: costMicro,
      metadata: { ...metadata, byok: true },
    });
    // The usage_events row has automnaTokens = 0 for billing purposes
    // but costMicrodollars is still tracked for analytics
  } else {
    // Standard: log and count against budget
    logUsageEventBackground({
      userId: user.clerkId,
      eventType: 'llm',
      costMicrodollars: costMicro,
      metadata: { ...metadata, byok: false },
    });
  }

  return response;
}
```

**Key decision:** BYOK requests still go through our proxy. This gives us:
- Usage analytics (even though we don't bill for it)
- RPM rate limiting (prevent abuse)
- Model restrictions per plan (Lite can't use Opus, etc. — if we want)
- Ability to detect and handle invalid/expired keys

### 6d. Usage Events Changes

Add `byok` flag to usage events:

```sql
ALTER TABLE usage_events ADD COLUMN byok INTEGER DEFAULT 0;
```

When querying budget usage, exclude BYOK LLM events:

```typescript
export async function getUsedAutomnaTokens(userId: string, excludeByokLlm = true): Promise<number> {
  const monthStart = getMonthStart();

  let query = db
    .select({ total: sql<number>`COALESCE(SUM(automna_tokens), 0)` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.timestamp, monthStart),
        // Exclude BYOK LLM events from budget calculation
        excludeByokLlm
          ? or(
              ne(usageEvents.eventType, 'llm'),
              eq(usageEvents.byok, 0)
            )
          : undefined
      )
    );

  const result = await query;
  return Number(result[0]?.total || 0);
}
```

### 6e. Non-LLM Budget for BYOK Users

BYOK users still need a budget for non-LLM services. Define per-plan:

```typescript
export const PLAN_LIMITS = {
  lite: {
    monthlyAutomnaCredits: 50_000,        // $5 cost cap
    requestsPerMinute: 10,
    monthlyCallMinutes: 30,
    byokRequired: false,
    byokLlmExcluded: false,              // Dynamic: true when BYOK enabled
  },
  starter: {
    monthlyAutomnaCredits: 200_000,       // $20 cost cap (or non-LLM only if BYOK)
    requestsPerMinute: 20,
    monthlyCallMinutes: 60,
    byokRequired: false,
    byokLlmExcluded: false,              // Dynamic: true when BYOK enabled
  },
  pro: {
    monthlyAutomnaCredits: 1_000_000,     // $100 cost cap (or non-LLM only if BYOK)
    requestsPerMinute: 60,
    monthlyCallMinutes: 120,
    byokRequired: false,
    byokLlmExcluded: false,
  },
  business: {
    monthlyAutomnaCredits: 5_000_000,     // $500 cost cap (or non-LLM only if BYOK)
    requestsPerMinute: 120,
    monthlyCallMinutes: 300,
    byokRequired: false,
    byokLlmExcluded: false,
  },
} as const;

// Non-LLM budgets when BYOK is active
export const BYOK_NON_LLM_BUDGETS = {
  lite: 50_000,       // $5
  starter: 50_000,    // $5
  pro: 100_000,       // $10
  business: 200_000,  // $20
} as const;
```

When BYOK is active, the effective budget switches to the non-LLM-only amount. This is
much smaller (since non-LLM services are cheap), but more than enough for typical usage.

> **Note:** All paid plans include phone calling. The `monthlyCallMinutes` backend cap is
> a safety guard rail, separate from the credit pool.

---

## 7. Overage Handling

Three options for when a user hits their included token budget:

### Option 1: Hard Wall (Current)
User gets blocked. Must upgrade or wait for reset.

### Option 2: BYOK Overage (Recommended)
When a user hits their included budget, prompt them to add their own API key to continue.
LLM traffic switches to their key for the rest of the billing cycle.

```
┌─────────────────────────────────────────────┐
│  You've used 100% of your Pro plan tokens.  │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Add your Anthropic API key to       │   │
│  │  keep chatting. You'll pay Anthropic │   │
│  │  directly for additional usage.      │   │
│  │                                      │   │
│  │  [Add API Key]   [Upgrade Plan]      │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

This is the smoothest UX: no hard wall, no surprise charges, user explicitly opts in.

### Option 3: Pay-Per-Token Overage
Charge overage at a markup (e.g., 1.5x Anthropic rate) on the user's credit card.

**Not recommended for MVP.** Adds billing complexity (metered Stripe billing), potential
for bill shock, and support headaches. Consider for later.

### Recommendation: Option 2 (BYOK Overage)

- When budget is hit, show a clear prompt
- User can add their API key right there (modal/inline)
- Once added, LLM traffic switches to their key immediately
- At next billing cycle, they can choose to keep BYOK or remove it
- This doubles as the onboarding flow for BYOK-curious users

---

## 8. UX Flow

### 8a. Pricing Page

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│   Lite   │  │ Starter  │  │   Pro    │  │ Business │
│  $20/mo  │  │  $79/mo  │  │ $149/mo  │  │ $299/mo  │
│          │  │          │  │ ★ Popular│  │          │
│ 50K      │  │ 200K     │  │ 1M       │  │ 5M       │
│ credits  │  │ credits  │  │ credits  │  │ credits  │
│          │  │          │  │          │  │          │
│ Full     │  │ Always-on│  │ Higher   │  │ Highest  │
│ agent    │  │ 24/7     │  │ rate     │  │ rate     │
│ All      │  │ Proactive│  │ limits   │  │ limits   │
│ integr.  │  │ monitor  │  │ Custom   │  │ API      │
│ Browser  │  │ Long-term│  │ skills   │  │ access   │
│ Phone    │  │ memory   │  │ Email    │  │ Analytics│
│ Email    │  │          │  │ support  │  │ Dedicated│
│ Sleeps   │  │          │  │          │  │ support  │
│ idle     │  │          │  │          │  │          │
│[Get Lite]│  │[ Start ]│  │[ Go Pro ]│  │[Business]│
└──────────┘  └──────────┘  └──────────┘  └──────────┘

         ┌─────────────────────────────────────┐
         │  Already have an API key?           │
         │  All plans support BYOK for         │
         │  unlimited LLM usage.               │
         │  [Learn more]                       │
         └─────────────────────────────────────┘
```

### 8b. Onboarding (Lite Tier)

```
Step 1: Account created
Step 2: "Connect your Anthropic API key"
        - Input field with "sk-ant-api..." placeholder
        - "Don't have a key? Get one at console.anthropic.com"
        - [Test Key] button → validates against Anthropic
        - [Continue] → provisions machine
Step 3: Agent deployed
```

### 8c. Settings → API Key (All Tiers)

```
┌─ Settings ──────────────────────────────────────────┐
│                                                      │
│  API Key                                             │
│  ─────────                                           │
│                                                      │
│  ○ Use included tokens (200K/month on your plan)     │
│  ● Bring your own Anthropic API key                  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  sk-ant-api03-•••••••••••••••••kF           │   │
│  └──────────────────────────────────────────────┘   │
│  Key added Feb 8, 2026  ✅ Valid                     │
│                                                      │
│  [Test Key]  [Remove Key]                            │
│                                                      │
│  When using your own key:                            │
│  • LLM usage is billed directly by Anthropic         │
│  • No monthly token limits on chat                   │
│  • Platform features (search, browser, email,        │
│    calls) still count against your plan budget       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 8d. Usage Banner (BYOK Active)

```
┌─────────────────────────────────────────────────────┐
│  Pro Plan  •  BYOK Active                           │
│  LLM: Using your own key (no limit)                 │
│  Platform: 12K of 100K tokens used ████░░░░░░ 12%   │
└─────────────────────────────────────────────────────┘
```

### 8e. Overage Prompt (Non-BYOK User)

When a Starter/Pro/Business user hits their budget:

```
┌─────────────────────────────────────────────────────┐
│  ⚠️ You've used all your tokens this month          │
│                                                      │
│  Two options:                                        │
│                                                      │
│  1. Add your Anthropic API key to keep chatting      │
│     You'll pay Anthropic directly — no markup.       │
│     [Add My API Key]                                 │
│                                                      │
│  2. Upgrade your plan for more included tokens       │
│     [View Plans]                                     │
│                                                      │
│  Your tokens reset on March 1.                       │
└─────────────────────────────────────────────────────┘
```

---

## 9. Security Considerations

### API Key Protection

1. **Encrypted at rest:** AES-256-GCM in Turso (never plaintext)
2. **Decrypted only in proxy:** Key is decrypted in the Vercel serverless function that
   makes the Anthropic API call, then discarded
3. **Never sent to user machines:** The key stays server-side. User machines still use
   their gateway token; the proxy decides which upstream key to use
4. **Masked in UI:** Only last 4 characters shown after initial entry
5. **Audit logged:** All BYOK enable/disable events logged

### Key Validation

- Validate format (`sk-ant-api*`)
- Test against Anthropic's API (lightweight `/v1/messages` call with 1 token max)
- Reject expired or invalid keys immediately
- Periodically re-validate stored keys (on LLM request failure, try re-validating)

### Abuse Prevention

- BYOK users still go through our proxy (we see all traffic)
- RPM rate limits still apply (prevent someone hammering Anthropic through us)
- If a BYOK key fails repeatedly, auto-disable and notify user
- Usage logging captures everything (even BYOK) for analytics

### Key Rotation

- Users can update their key anytime via the settings page
- Old key is overwritten (not versioned)
- If key expires, LLM requests fail gracefully with a clear error message prompting
  the user to update their key

---

## 10. Migration Path

### Phase 1: Lite Tier + BYOK Settings (MVP)

1. Create Stripe product for Lite ($29/mo)
2. Add `byok_api_key_encrypted` and `byok_enabled` to users table
3. Build `/api/user/byok` endpoints
4. Update LLM proxy to support dual-key routing
5. Update provisioning for Lite tier (require API key)
6. Add BYOK toggle to settings page
7. Update pricing page with Lite tier

**Estimated effort:** 2-3 days

### Phase 2: BYOK Overage Prompts

1. Update UsageBanner to show BYOK prompt at 100% usage
2. Add inline API key entry modal
3. Auto-switch to BYOK mode when key is added mid-cycle

**Estimated effort:** 1 day

### Phase 3: Analytics & Polish

1. Dashboard shows BYOK vs included usage breakdown
2. Admin dashboard shows BYOK adoption rate
3. Usage alerts for BYOK users (Anthropic spend estimates)
4. Key health monitoring (periodic re-validation)

**Estimated effort:** 1-2 days

---

## 11. Open Questions

### Pricing

1. **Lite pricing set at $20/mo.** At $20, margin is ~$7-12/user (fixed cost ~$8).
   Thin but profitable, and the low cost cap ($5) prevents losses.

2. **Lite has full features but machine sleeps when idle.** All integrations, browser,
   phone, email included. The key difference vs Starter is always-on vs sleep-when-idle,
   plus proactive monitoring and long-term memory on Starter+.

3. **Non-LLM budget for BYOK tiers:** Is 50K credits ($5) enough? For context:
   - 50K credits = ~1,666 web searches, or 250 browser sessions, or 2,500 emails
   - Most users won't come close. But a heavy browser user might.

### Technical

4. **Should BYOK users be able to choose their model?** Currently all users get the plan's
   default model. BYOK users might want to use Opus when they're paying for it. Consider
   a model selector for BYOK users.

5. **Multi-provider BYOK?** Start with Anthropic only, but architecture should allow future
   providers (OpenAI, Google). The `byok_provider` column is already in the schema for this.

6. **BYOT (Max subscription tokens)?** We have research on this in SPEC.md. BYOT is legally
   gray and could break. Recommend keeping it separate from BYOK and not launching it yet.
   If users ask, "We support API keys. Max subscription tokens are not supported due to
   Anthropic's terms of service."

### Business

7. **Will this cannibalize higher tiers?** Risk: Pro users downgrade to Lite + BYOK.
   Mitigation: Lite has fewer features (1 integration, no phone, basic browser, 30-day
   memory). Power users who need full integrations still need Pro+.

8. **Messaging:** How do we explain BYOK without confusing non-technical users? Suggest:
   "Bring your own API key" with a simple FAQ: "What does this mean? → You connect your
   Anthropic account. You pay them directly for AI usage, and we handle everything else."

---

## Summary

**What we're building:**
- **Lite tier** ($20/mo) as a low-cost entry point with full features (machine sleeps when idle)
- **Optional BYOK** for all tiers (Lite/Starter/Pro/Business)
- **Overage via BYOK** — when users hit their credit budget, prompt them to add their own key
  instead of hard-blocking

**Key technical changes:**
- Encrypted API key storage in Turso
- LLM proxy dual-key routing (our key vs user's key)
- BYOK flag on usage events (don't count BYOK LLM against budget)
- Non-LLM-only budget for BYOK users
- Settings page for key management
- 4-tier pricing (Lite/Starter/Pro/Business)

**What stays the same:**
- Automna Credit system (unchanged)
- Non-LLM billing (unchanged)
- Machine provisioning (mostly unchanged, just different config for Lite)
- All platform features work identically regardless of BYOK status

---

## 12. Implementation Notes (2026-02-13)

### What's Actually Built

The BYOK pivot was implemented on the `staging` branch (commit `462c106`, 16 files) and deployed to prod.

**New pricing model:** BYOK-first, 3 tiers at $20/$30/$40. No more reselling LLM compute.

**Two credential types supported:**
1. **Setup token** (`sk-ant-oat01-...`) — from `claude setup-token` CLI command
2. **API key** (`sk-ant-api03-...`) — from console.anthropic.com

### Key Files
- `landing/src/app/api/user/byok/route.ts` — POST/GET/DELETE for credential management
- `landing/src/app/setup/connect/claude/page.tsx` — Setup token onboarding flow
- `landing/src/app/setup/connect/apikey/page.tsx` — API key onboarding flow
- `landing/src/lib/crypto.ts` — AES-256-GCM encryption for stored credentials

### Auth-Profiles Format (How OpenClaw Stores Credentials)

When we push credentials to a user's Fly machine, we write `/home/node/.openclaw/agents/main/agent/auth-profiles.json`:

```json
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "token": "sk-ant-oat01-..."
    }
  },
  "order": { "anthropic": ["anthropic:default"] },
  "lastGood": { "anthropic": "anthropic:default" }
}
```

For API keys:
```json
{
  "profiles": {
    "anthropic:default": {
      "type": "api_key",
      "provider": "anthropic",
      "key": "sk-ant-api03-..."
    }
  }
}
```

**Critical:** These formats were confirmed by reading OpenClaw source code (`upsertAuthProfile` in `github-copilot-auth-C5ublI9m.js`). Do NOT use `type: "oauth"` with `access` field — that's for full OAuth credentials with refresh tokens, not setup tokens.

### Validation Logic

- **API keys (`sk-ant-api`):** Validated against Anthropic `/v1/messages` API with a minimal request (claude-3-haiku, max_tokens=1). Uses `x-api-key` header.
- **Setup tokens (`sk-ant-oat`):** NOT validated against the API. These are OAuth access tokens scoped to Claude Code and cannot call `/v1/messages` directly. We accept them based on format only and let OpenClaw handle authentication.

### Bug Fixes (2026-02-13)
1. **Setup token validation always failed (401):** OAuth tokens can't call `/v1/messages`. Fixed by skipping API validation for setup tokens entirely.
2. **Wrong auth-profiles.json format:** Was writing `type: "oauth"` + `access` field. Fixed to `type: "token"` + `token` field for setup tokens, `type: "api_key"` + `key` field for API keys.
3. **Model validation issue:** Initially used `claude-sonnet-4-20250514` for validation which may not be available on all subscription tiers. Switched to `claude-3-haiku-20240307`.

### Known Limitations
- Setup tokens are accepted on format alone (no server-side validation). If someone pastes an expired or invalid token, the agent just won't work and they'll see errors there.
- No refresh token handling. If a setup token expires, the user needs to generate a new one.
- Future improvement: implement our own OAuth flow (redirect to `claude.ai/oauth/authorize`) to get both access + refresh tokens directly.
