# Automna BYOK-First Pivot

> **Date:** 2026-02-12 (updated 2026-02-13)
> **Status:** Deployed to Production
> **Owner:** Alex + Joi

---

## Executive Summary

Automna pivots to a **BYOK-first** model. We stop reselling LLM compute entirely and sell the **automation platform**: hosting, integrations, workflows, and reliability. Users bring their own Anthropic key (Claude Code OAuth preferred, API key as fallback). A "Bill me as I go" proxy option exists for users who don't want to manage credentials.

**New tiers:** $20 / $30 / $40
**Old tiers (legacy, still honored):** $20 / $79 / $149 / $299

This removes all variable LLM cost risk, stabilizes margins at 45-74%, and makes every tier profitable in every usage scenario.

---

## 1. Two Plan Systems (Legacy vs BYOK)

### Legacy Plans (Grandfathered)
Users on old plans (`lite`, `starter`@$79, `pro`@$149, `business`@$299) keep their existing behavior:
- **Always-on machines** (no auto-stop)
- **Large monthly credit allowances** for LLM via our proxy
- No changes until they manually switch to a BYOK plan
- Differentiated by `byokProvider: null` in the database

### BYOK Plans (New)
Users on new plans (`starter`@$20, `pro`@$30, `power`@$40):
- **Bring their own Claude credentials** (OAuth token or API key)
- **Small service credit allowances** for proxy services (search, browser, email, calls)
  - Starter: 20K credits ($2/mo)
  - Pro: 50K credits ($5/mo)
  - Power: 50K credits ($5/mo)
- Credits also act as LLM fallback if their credentials break
- Can buy credit top-ups via prepaid packs
- Differentiated by `byokProvider: 'anthropic_oauth' | 'anthropic_api_key' | 'proxy'`

### "Bill Me As I Go" (Proxy Mode)
Users who don't want to manage credentials:
- `byokProvider: 'proxy'`
- LLM calls route through our proxy (we pay Anthropic)
- **Prepaid credits only** — no monthly allowance included
- Get 5K starter bonus credits on first selection
- Hard-blocked at $0 balance
- Can buy credit packs: $5/50K, $10/100K, $25/300K, $50/750K
- Auto-refill available with monthly cost cap

---

## 2. Tier Structure

### Starter — $20/mo
**Target:** Cost-conscious users, hobbyists, people trying it out

- Full AI agent (BYOK — user's own Anthropic key)
- All core integrations (Discord, Telegram, WhatsApp, web chat)
- Unlimited connected channels
- Browser automation & web search
- Email (send/receive)
- Persistent memory
- **20K service credits/mo ($2)** — covers search/browser/email
- Machine **sleeps when idle** (auto-stop, ~30s cold start)
- Community support
- ❌ No phone calling
- ❌ No scheduled tasks/cron
- ❌ No custom skills

### Pro — $30/mo
**Target:** Daily users who want a real always-on assistant

- Everything in Starter, plus:
- **Always-on 24/7** (no idle sleep)
- **50K service credits/mo ($5)**
- **Phone calling** (60 min/mo)
- Scheduled tasks & cron jobs
- Custom skills/automations
- File browser & workspace access
- Priority support

### Power — $40/mo
**Target:** Power users, developers, small teams

- Everything in Pro, plus:
- **50K service credits/mo ($5)**
- **Phone calling** (120 min/mo)
- API access (programmatic control)
- Advanced analytics & usage dashboard
- Persistent browser sessions (Browserbase)
- Team sharing (+1 collaborator seat)
- Dedicated support

### Feature Matrix

| Feature | Starter $20 | Pro $30 | Power $40 |
|---|:---:|:---:|:---:|
| Full AI agent (BYOK) | ✅ | ✅ | ✅ |
| Browser & search | ✅ | ✅ | ✅ |
| Email | ✅ | ✅ | ✅ |
| Persistent memory | ✅ | ✅ | ✅ |
| Service credits/mo | 20K ($2) | 50K ($5) | 50K ($5) |
| Machine uptime | Sleeps idle | Always-on | Always-on |
| Channels | Unlimited | Unlimited | Unlimited |
| Phone calling | ❌ | 60 min/mo | 120 min/mo |
| Cron / scheduled tasks | ❌ | ✅ | ✅ |
| Custom skills | ❌ | ✅ | ✅ |
| File browser | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ |
| Support | Community | Priority | Dedicated |

---

## 3. Machine Lifecycle

### Auto-Stop/Auto-Start (Fly.io)
- **Starter/Free/Canceled:** `auto_stop: "stop"`, `auto_start: true`
  - Machine stops after ~5 min of no active connections
  - Fly proxy holds incoming requests and boots machine (~10-30s)
  - WebSocket from dashboard counts as active connection
  - Outbound connections (Discord bot, etc.) don't prevent auto-stop
- **Pro/Power:** `auto_stop: "off"` — always running
- **Legacy users:** Always-on regardless of plan (no auto-stop until they switch)

### On Plan Changes
- **Upgrade to Pro/Power:** Auto-stop disabled immediately
- **Downgrade to Starter:** Auto-stop enabled, but `effective_plan` preserves old limits until billing period ends
- **Cancellation:** Auto-stop enabled, plan set to `free`

---

## 4. Credit System

### Service Credits (BYOK Users)
- Small monthly allowance covers proxy services (search, browser, email, calls)
- Also acts as LLM fallback if BYOK credentials fail
- 1 credit = $0.0001
- Not publicized — quiet perk to make things work smoothly

### Prepaid Credits (Proxy Users)
- No monthly allowance — must buy credit packs
- 5K starter bonus on first proxy selection
- Packs: $5/50K, $10/100K, $25/300K, $50/750K
- Hard-blocked at $0 balance
- Auto-refill: charges default Stripe payment method when balance drops below threshold
- Monthly cost cap prevents runaway auto-refill spending

### Credit Costs
| Service | Credits/use |
|---|---|
| Web search | 30/query |
| Browser session | 200/session |
| Email send | 20/send |
| Phone call | 900/min |
| LLM (Sonnet) | ~500-2000/call |

### Technical Details
- Deduction: atomic SQL `MAX(0, balance - amount)` to prevent races
- All deductions logged in `credit_transactions` table
- Auto-refill triggers after deduction if balance < threshold
- Monthly spent counter resets on 1st of month

---

## 5. Authentication

### Path A: Claude Code Setup Token (Recommended)
- User runs `claude setup-token` → gets `sk-ant-oat...` token
- Token pushed to Fly machine as `auth-profiles.json`
- LLM calls go direct to Anthropic (no proxy)
- **No extra AI costs** beyond their Claude subscription

### Path B: API Key
- User gets `sk-ant-api...` from console.anthropic.com
- Validated against Anthropic API before saving
- Same direct-to-Anthropic routing

### Path C: Bill Me As I Go (Proxy)
- No credentials needed
- LLM calls route through Automna proxy
- Billed via prepaid credits

### Credential Removal
- DELETE `/api/user/byok` removes credentials
- Machine reverts to proxy mode automatically
- `ANTHROPIC_BASE_URL` restored, `BYOK_MODE` removed

---

## 6. Rate Limiting

### How It Works
The rate limiter (`rate-limit.ts`) branches based on `byokProvider`:

1. **Legacy users** (`null`): Monthly budget from `LEGACY_PLAN_LIMITS` (generous)
2. **BYOK users** (`anthropic_oauth`/`anthropic_api_key`): Monthly budget from `PLAN_LIMITS.monthlyServiceCredits` (small)
3. **Proxy users** (`proxy`): Prepaid credit balance check (hard block at $0)

All users share RPM limits from `LEGACY_PLAN_LIMITS`.

### Limits Reference

**BYOK Plans (monthlyServiceCredits):**
| Plan | Credits/mo | Dollar Value |
|---|---|---|
| Starter | 20,000 | $2 |
| Pro | 50,000 | $5 |
| Power | 50,000 | $5 |

**Legacy Plans (monthlyAutomnaCredits):**
| Plan | Credits/mo |
|---|---|
| Free | 10,000 |
| Lite | 50,000 |
| Starter | 200,000 |
| Pro | 1,000,000 |
| Power | 5,000,000 |
| Business | 5,000,000 |

---

## 7. Stripe Configuration

### Live BYOK Product
- Product: `prod_TyPC6NXaq9UmaQ`
- Starter: `price_1T0SNoLgmKPRkIsHDJ2r9WXC` ($20/mo)
- Pro: `price_1T0SNpLgmKPRkIsHPvIONcch` ($30/mo)
- Power: `price_1T0SNqLgmKPRkIsHGLijTU4l` ($40/mo)

### Credit Packs
One-time payments via `price_data` in Stripe checkout (no pre-created products).

### Webhooks
- `checkout.session.completed`: handles both subscriptions and credit purchases
- `customer.subscription.updated`: plan changes, downgrades with grace period
- `customer.subscription.deleted`: sets plan to free, enables auto-stop
- `invoice.payment_failed`: sends notification email

---

## 8. Database Schema (Key Fields)

### machines table
- `byok_provider`: `'anthropic_oauth'` | `'anthropic_api_key'` | `'proxy'` | `null` (legacy)
- `byok_enabled`: 1 if BYOK credentials are active
- `effective_plan`: higher plan to honor on downgrade
- `effective_plan_until`: unix timestamp for grace period

### credit_balances table
- `balance`: current credits
- `auto_refill_enabled`, `auto_refill_amount_cents`, `auto_refill_threshold`
- `monthly_cost_cap_cents`, `monthly_spent_cents`, `monthly_spent_reset_at`

### credit_transactions table
- Types: `purchase`, `usage`, `refill`, `bonus`
- All deductions and additions logged for user transparency

---

## 9. Known Gaps / Future Work

1. **BYOK→proxy fallback** — If credentials fail, no automatic fallback to proxy. Large architectural change.
2. **Email notification for auto-refill** — Users should be notified when charged.
3. **Existing machine migration** — Current machines don't have auto_stop set. Needs one-time script for starter-tier machines.
4. **Usage transaction volume** — Every proxy call creates a transaction row. May need batching for heavy users.
5. **Multi-provider BYOK** — Anthropic only. OpenAI/Google later.
6. **`PROXY_API_SECRET`** — Not set (deduct endpoint unused, deduction is inline).
