# Automna BYOK Pivot — Pricing + Implementation Proposal

Date: 2026-02-11
Owner: Joi

## Executive Summary
Automna should pivot to a **BYOK-first subscription** model. We stop reselling LLM compute and sell the **automation platform** instead: hosting, integrations, workflows, and reliability. This removes variable LLM costs, stabilizes margins, and aligns with the reality that users can get far more compute from their own Claude subscriptions.

**Recommended direction:**
- **BYOK-only** at launch for simplicity, with an optional managed-compute add‑on later if needed.
- **One or two tiers**, anchored at **$29/mo** for the platform and an optional **$79/mo** power tier.
- Build a **Claude subscription OAuth flow** for ease, but treat API‑key BYOK as the most stable path.

---

## 1) Pricing Model Options

### Option A — BYOK-only (recommended)
- User brings Claude Pro/Max or API key
- Automna bills a flat platform fee
- **Pros:** No token liability, predictable margins, simpler billing
- **Cons:** Higher onboarding friction

### Option B — BYOK + Managed Compute Add‑On
- Platform fee + optional managed compute price
- **Pros:** Captures users who do not want to set up keys
- **Cons:** Re‑introduces token liability and billing complexity

**Recommendation:** Launch with **Option A**. Add Option B only if demand is clear.

---

## 2) Recommended Tier Structure

### Tier 1 — Platform ($29/mo)
**Target:** Claude Pro users and cost‑sensitive Max users
- Full platform access
- Standard concurrency (1 agent at a time)
- All integrations

**Rationale:**
- Infra cost is ~ $10/mo
- $29 yields strong margin and easy sell with Claude Pro ($20)

### Tier 2 — Power ($79/mo) (optional)
**Target:** Claude Max users
- Higher concurrency (3+ agents)
- Always‑on browser sessions
- Priority support

**Rationale:**
- Claude Max users already pay $100–$200
- $79 feels like a reasonable force multiplier

### Team Tier — $249/mo (optional, later)
- 3 seats, shared workflows, centralized billing
- Additional seats $50/mo

---

## 3) Unit Economics (Example)

Assume infra cost = **$10/user/mo**

### Platform $29
- Revenue: $29
- Infra: $10
- Stripe + support overhead: ~$3
- **Gross margin: ~55–60%**

### Power $79
- Revenue: $79
- Infra: $15–25 (higher concurrency)
- Stripe + support overhead: ~$6
- **Gross margin: ~60%**

This is dramatically more stable than the current credit model.

---

## 4) Onboarding Flow (Claude OAuth)

**Flow:**
1) Sign up → checkout
2) Connect Claude account
3) Provision Fly machine
4) Pair channel

**Auth options:**
- **Claude subscription OAuth** for easiest user experience
- **API key** as the stable alternative

**Recommendation:** Support both, but default to OAuth for non‑technical users.

---

## 5) Operational Implications

**Billing:**
- Single Stripe subscription product
- Remove usage metering from billing logic

**Infra:**
- Standardize machine size for most users
- Concurrency caps to protect infra

**Support:**
- Clear error messaging if auth expires
- Token refresh UX

---

## 6) Migration Plan (From Credit Model)

1) Announce the pivot and explain the economics
2) Offer a **discounted migration** for existing users
3) Convert unused credits into months of subscription
4) Sunset the credit model by a firm date

---

## 7) Risks + Mitigations

**Risk:** Claude subscription OAuth is less stable than API keys
- **Mitigation:** Keep API‑key path available

**Risk:** Churn of low‑usage users
- **Mitigation:** This is acceptable because infra is fixed and low‑usage users are unprofitable

**Risk:** Infra abuse on $29 tier
- **Mitigation:** Concurrency limits and idle timeouts

---

## 8) Messaging + Positioning

**Positioning:**
- “Automna is the automation layer for your Claude subscription.”
- “Bring your own AI, we provide the hands.”

**Headline:**
- “Don’t just chat with Claude. Put it to work.”

---

## 9) Open Questions

1) Do we want two tiers or one?
2) How aggressively should we nudge users toward Max?
3) Should the power tier include an always‑on browser or still idle‑sleep?

---

## Market Scan: OpenClaw Wrappers (Preliminary)
**Status:** Initial scan found *hosting providers and setup guides* more than true SaaS "wrappers." If there are specific competitors you care about, send names and I will dig deeper.

**What exists (so far):**
- **Managed OpenClaw hosting** advertised around **$24–$50/mo** for the server layer, *plus* the user’s model/API costs (often $20–$60/mo in examples). This puts “all‑in” cost for a managed host around **$44–$84/mo** in many guides.
- **DIY VPS hosting** spans **$2–$70/mo** depending on provider and specs, with the same API costs layered on top.
- Many articles emphasize **OpenClaw is free software**, pricing is really **hosting + API usage**.

**Implication for Automna:**
- We are not competing on “cheap VPS hosting.”
- We should position as **managed automation + integrations** with a clean user experience, not as “hosted OpenClaw.”
- A **$29/mo platform fee** is competitive versus managed hosting alone once you add Claude Pro/Max.

**Next step:** If you want a true competitor scan, I’ll focus on *named* products (not generic hosting blog posts) and validate pricing directly from their sites.
