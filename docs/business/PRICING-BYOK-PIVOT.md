# Automna BYOK-First Pivot

> **Date:** 2026-02-12
> **Status:** Planning
> **Owner:** Alex + Joi

---

## Executive Summary

Automna pivots to a **BYOK-first** model. We stop reselling LLM compute entirely and sell the **automation platform**: hosting, integrations, workflows, and reliability. Users bring their own Anthropic key (Claude Code OAuth preferred, API key as fallback).

**New tiers:** $20 / $30 / $40
**Old tiers (deprecated):** $20 / $79 / $149 / $299

This removes all variable LLM cost risk, stabilizes margins at 45-74%, and makes every tier profitable in every usage scenario.

---

## 1. Tier Structure

### Starter — $20/mo
**Target:** Cost-conscious users, hobbyists, people trying it out

- Full AI agent (BYOK — user's own Anthropic key)
- All core integrations (Discord, Telegram, WhatsApp, web chat)
- **1 connected channel** at a time
- Browser automation & web search
- Email (send/receive)
- Persistent memory
- Machine **sleeps when idle**
- Community support
- ❌ No phone calling
- ❌ No scheduled tasks/cron
- ❌ No custom skills

### Pro — $30/mo
**Target:** Daily users who want a real always-on assistant

- Everything in Starter, plus:
- **Always-on 24/7** (no idle sleep)
- **3 simultaneous channels**
- **Phone calling** (60 min/mo)
- Scheduled tasks & cron jobs
- Custom skills/automations
- File browser & workspace access
- Priority support

### Power — $40/mo
**Target:** Power users, developers, small teams

- Everything in Pro, plus:
- **Unlimited channels**
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
| Machine uptime | Sleeps idle | Always-on | Always-on |
| Channels | 1 | 3 | Unlimited |
| Phone calling | ❌ | 60 min/mo | 120 min/mo |
| Cron / scheduled tasks | ❌ | ✅ | ✅ |
| Custom skills | ❌ | ✅ | ✅ |
| File browser | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ |
| Analytics | Basic | Standard | Advanced |
| Team seats | — | — | +1 collaborator |
| Support | Community | Priority | Dedicated |

---

## 2. Authentication

Users connect their own Anthropic credentials. Two paths, with Claude Code strongly recommended:

### Path A: Claude Code Setup Token (Recommended — Best Value)
- User runs `claude setup-token` in their terminal
- Claude CLI handles browser-based Anthropic login
- Generates an OAuth token (`sk-ant-oat01-...`) tied to their Claude subscription
- Token pushed to their Fly machine, OpenClaw talks directly to Anthropic
- **No extra AI costs** — uses their existing Claude Pro ($20/mo) or Max ($100-200/mo) subscription
- Requires Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

### Path B: Anthropic API Key (Alternative — More Expensive)
- User gets API key from console.anthropic.com
- Key pushed to their Fly machine as auth credential
- **⚠️ Pay-per-use pricing** — costs vary widely, heavy Opus usage can run $100-500+/mo
- Best for developers who want direct API control or don't have a Claude subscription

### Architecture
LLM calls go **direct from the user's machine to Anthropic** — no proxy in the middle. Non-LLM services (search, browser, email, phone) still route through our proxies since those are our API keys and costs.

```
LLM:       User's OpenClaw → Anthropic (direct, user's credentials)
Services:  User's OpenClaw → Automna proxies (our keys, our costs)
```

---

## 3. Cost Analysis

### Fixed Costs Per User

| Component | Starter $20 | Pro $30 | Power $40 |
|---|---|---|---|
| Fly machine (shared-cpu-1x, 2GB) | ~$3-5* | $7.00 | $7.00 |
| Fly volume (1GB) | $0.15 | $0.15 | $0.15 |
| Twilio phone number | — | $1.15 | $1.15 |
| Agentmail inbox | ~$0 | ~$0 | ~$0 |
| Stripe fees (2.9% + $0.30) | $0.88 | $1.17 | $1.46 |
| **Fixed total** | **~$4-6** | **~$9.47** | **~$9.76** |

*Starter machines sleep when idle, reducing effective Fly cost.
No Twilio number for Starter (phone gated to Pro+).*

### Variable Costs (Non-LLM Only)

With BYOK, we pay **zero** for LLM API calls. Variable costs are only non-LLM services:

| Service | Cost/unit | Light/mo | Moderate/mo | Heavy/mo |
|---|---|---|---|---|
| Web search (Perplexity) | $0.003/query | $0.10 | $0.50 | $1.50 |
| Browser (Browserbase) | $0.002/min | $0.05 | $0.30 | $2.00 |
| Email send | $0.002/send | $0.02 | $0.10 | $0.50 |
| Phone calling | $0.09/min | — | $2.00 | $5.00 |
| **Variable total** | | **~$0.17** | **~$2.90** | **~$9.00** |

### Margin Analysis

#### Starter — $20/mo

| Scenario | Fixed | Variable | Total Cost | Margin | % |
|---|---|---|---|---|---|
| Light | $5.50 | $0.17 | $5.67 | **$14.33** | **72%** |
| Moderate | $5.50 | $0.90 | $6.40 | **$13.60** | **68%** |
| Heavy | $5.50 | $2.50 | $8.00 | **$12.00** | **60%** |

#### Pro — $30/mo

| Scenario | Fixed | Variable | Total Cost | Margin | % |
|---|---|---|---|---|---|
| Light | $9.47 | $0.50 | $9.97 | **$20.03** | **67%** |
| Moderate | $9.47 | $2.90 | $12.37 | **$17.63** | **59%** |
| Heavy | $9.47 | $7.00 | $16.47 | **$13.53** | **45%** |

#### Power — $40/mo

| Scenario | Fixed | Variable | Total Cost | Margin | % |
|---|---|---|---|---|---|
| Light | $9.76 | $0.50 | $10.26 | **$29.74** | **74%** |
| Moderate | $9.76 | $3.50 | $13.26 | **$26.74** | **67%** |
| Heavy | $9.76 | $9.00 | $18.76 | **$21.24** | **53%** |

### Key Insight: Zero Loss Scenarios

Under the old model, heavy Business users could lose $226/user/mo. Under BYOK, **every tier is profitable in every scenario**. Worst case is Power heavy user at 53% margin.

---

## 4. Comparison: Old vs New

| | Old Model | BYOK Model |
|---|---|---|
| Revenue per user | $20-299 | $20-40 |
| LLM cost risk | High (up to $500/user) | **Zero** |
| Worst-case margin | **-$226 (loss)** | **$12.00 (60%)** |
| Billing complexity | Credits, metering, overages | Flat subscription |
| Onboarding friction | Low (we handle everything) | Medium (need API key) |
| Scalability | Limited by LLM costs | Nearly unlimited |

**Trade-off:** Lower revenue per user, but dramatically lower risk and simpler operations. Need more users but each one is reliably profitable.

**Break-even math:** At blended ~60% margin and ~$30 avg revenue, need ~167 users for $3K MRR, ~333 for $6K MRR.

---

## 5. Non-LLM Usage Budgets

Even with BYOK, we need caps on non-LLM services to prevent abuse:

| Service | Starter | Pro | Power |
|---|---|---|---|
| Web searches/mo | 500 | 2,000 | 10,000 |
| Browser minutes/mo | 60 | 300 | 1,000 |
| Emails/mo | 100 | 500 | 2,000 |
| Phone minutes/mo | — | 60 | 120 |

These are generous for normal use but prevent runaway costs. Equivalent to ~$3-5 of non-LLM spend for Starter, ~$10-15 for Pro, ~$20-30 for Power.

---

## 6. Onboarding Flow

```
1. Sign up (Clerk auth)
2. Pick tier → Stripe checkout
3. "Connect your AI" — choose path:
   a. Claude Code (recommended): run `claude setup-token`, paste token
   b. API key: get from console.anthropic.com, paste key
4. Validate credential
5. Provision Fly machine + push credential to machine
6. Connect first channel (Discord/Telegram/WhatsApp/web)
7. Agent is live
```

See `BYOK-IMPLEMENTATION.md` for detailed screen mockups of the onboarding flow.

---

## 7. Migration Plan

### Existing User Mapping

| Current Plan | New Plan | Price Change |
|---|---|---|
| Lite $20 | Starter $20 | Same |
| Starter $79 | Pro $30 | -$49/mo (price drop) |
| Pro $149 | Power $40 | -$109/mo (price drop) |
| Business $299 | Power $40 + personal outreach | -$259/mo |

### Migration Steps

1. **Announce pivot** — email + in-app banner explaining the change
2. **30-day grace period** — existing users keep included compute for 30 days
3. **API key connection prompt** — in-app flow to connect their Anthropic account
4. **Auto-downgrade pricing** — Stripe subscriptions updated to new prices
5. **Sunset old billing** — remove credit system, usage metering for LLM

### Messaging to Users

> "We're making Automna more affordable. Your plan is dropping from $X to $Y.
> The one change: you'll connect your own Anthropic account for AI usage.
> This means unlimited AI with no caps from us. You have 30 days to connect."

---

## 8. Technical Implementation

### What Changes

1. **Stripe:** New products/prices for $20/$30/$40 tiers
2. **Auth flow:** Add Claude OAuth or API key entry to onboarding
3. **LLM proxy:** Route to user's key instead of ours (proxy stays for analytics + rate limiting)
4. **Usage tracking:** Remove LLM credit metering. Add non-LLM service caps.
5. **Feature gating:** Enforce tier-specific feature access (phone, cron, channels, API)
6. **Dashboard:** Update usage display (no more credit bar for LLM, show service usage instead)

### What Stays the Same

- Fly machine provisioning
- OpenClaw runtime
- All integrations (Discord, Telegram, WhatsApp, web, email)
- Memory system
- Browser automation infrastructure
- Phone calling infrastructure (just gated by tier)

### Key Technical Details

See existing docs for implementation specifics:
- API key encryption: `docs/features/BYOK.md` §6a
- LLM proxy changes: `docs/features/BYOK.md` §6c
- Feature gating: needs new implementation for channel limits, cron access, phone access

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Claude OAuth not available for 3rd parties | Can't offer one-click auth | API key as primary path, research OAuth feasibility |
| Users confused by BYOK concept | Churn at onboarding | Clear messaging, FAQ, guided setup |
| Lower revenue per user | Need more users for same MRR | Much lower risk per user, focus on volume |
| Browserbase abuse | Variable cost spike | Per-tier session limits |
| Anthropic key expiration/invalidation | Agent stops working | Auto-detect, notify user, graceful degradation |
| Users want models we don't support | Feature requests | Start Anthropic-only, add OpenAI/Google later |

---

## 10. Open Questions

1. **Setup token refresh** — Does OpenClaw auto-refresh `sk-ant-oat01-` tokens? What happens on expiry?
2. **Browser session limits** — What's reasonable per tier? Browserbase pricing model?
3. **Enterprise tier** — Should we have a "Contact us" above $40 for teams >2?
4. **Annual pricing** — Offer discount? (e.g., $16/$25/$33 per month billed annually)
5. **Free trial** — Any free tier or trial period? Risk: Fly machine cost on free users.
6. **Multi-provider BYOK** — Anthropic only at launch, but OpenAI/Google later?
7. **Future paid compute add-on** — If user's subscription runs out, offer metered compute through us?

---

## Appendix: Service Cost Reference

| Service | Provider | Unit Cost | Notes |
|---|---|---|---|
| Compute (always-on) | Fly.io | ~$7/mo | shared-cpu-1x, 2GB RAM |
| Compute (sleep-idle) | Fly.io | ~$3-5/mo | Effective cost with idle shutdown |
| Storage | Fly.io | $0.15/mo | 1GB persistent volume |
| Phone number | Twilio | $1.15/mo | US local number |
| Phone minutes | Bland AI | $0.09/min | BYOT mode |
| Email | Agentmail | ~$0/mo | Negligible at current scale |
| Web search | Perplexity | $0.003/query | Via OpenRouter |
| Browser | Browserbase | $0.002/min | Pro tier |
| Stripe processing | Stripe | 2.9% + $0.30 | Per transaction |
