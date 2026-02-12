# Automna BYOK Pivot — Full Recommendation

Date: 2026-02-11
Owner: Joi

## Executive Summary
Automna should pivot to a **BYOK‑first subscription** model. We stop reselling LLM compute and sell the **automation platform**: hosting, integrations, workflows, and reliability. This removes variable LLM costs, stabilizes margins, and aligns with reality that users can get far more compute from their own Claude subscriptions.

**Core recommendation:**
- **BYOK‑only** at launch for simplicity, with an optional managed‑compute add‑on later.
- **One or two tiers** anchored at **$29/mo** for the platform and an optional **$79/mo** power tier.
- **Claude subscription OAuth** for ease, **API‑key BYOK** as the stable default.
- Plan an **MCP‑based path** as the most durable long‑term integration.

---

## 1) Pricing Model Options

### Option A — BYOK‑only (recommended)
- User brings Claude Pro or Max or their API key
- Automna bills a flat platform fee
- Pros: No token liability, predictable margins, simpler billing
- Cons: Higher onboarding friction

### Option B — BYOK + Managed Compute Add‑On
- Platform fee + optional managed compute
- Pros: Captures users who want zero setup
- Cons: Re‑introduces token liability and billing complexity

**Recommendation:** Launch with Option A. Add Option B only if demand is clear.

---

## 2) Recommended Tier Structure

### Tier 1 — Platform ($29/mo)
**Target:** Claude Pro users and cost‑sensitive Max users
- Full platform access
- Standard concurrency, one agent at a time
- All integrations

**Rationale:**
- Infra cost is ~ $10/mo
- $29 yields strong margin and an easy sell with Claude Pro ($20)

### Tier 2 — Power ($79/mo) optional
**Target:** Claude Max users
- Higher concurrency, 3+ agents
- Always‑on browser sessions
- Priority support

**Rationale:**
- Max users already pay $100–$200
- $79 feels like a reasonable force multiplier

### Team Tier — $249/mo optional, later
- 3 seats, shared workflows, centralized billing
- Additional seats $50/mo

---

## 3) Unit Economics

Assume infra cost = **$10/user/mo**

### Platform $29
- Revenue: $29
- Infra: $10
- Stripe + support overhead: ~$3
- **Gross margin: ~55–60%**

### Power $79
- Revenue: $79
- Infra: $15–25
- Stripe + support overhead: ~$6
- **Gross margin: ~60%**

This is dramatically more stable than the current credit model.

---

## 4) Onboarding and UX Flow

**Flow:**
1) Sign up → checkout
2) Connect Claude account
3) Provision Fly machine
4) Pair channel

**Auth options:**
- **Claude subscription OAuth** for easiest user experience
- **API key** as the stable alternative

**Recommendation:** Support both. Default to API key for reliability, offer OAuth for convenience with clear warnings.

---

## 5) Operational Implications

**Billing:**
- Single Stripe subscription product
- Remove usage metering from billing logic

**Infra:**
- Standardize machine size for most users
- Concurrency caps to protect infra
- Idle timeouts to avoid runaway costs

**Support:**
- Clear error messaging if auth expires
- Token refresh UX

---

## 6) Migration Plan

1) Announce pivot and explain the economics
2) Offer a discounted migration for existing users
3) Convert unused credits into months of subscription
4) Sunset the credit model by a firm date

---

## 7) Risks and Mitigations

**Risk:** Claude subscription OAuth is less stable than API keys
- **Mitigation:** Keep API‑key path available

**Risk:** Churn of low‑usage users
- **Mitigation:** Accept this. Fixed infra means low‑usage users are often unprofitable

**Risk:** Infra abuse on $29 tier
- **Mitigation:** Concurrency limits and idle timeouts

**Risk:** Provider enforcement against subscription OAuth
- **Mitigation:** Prioritize API key path. Invest in MCP integration so the official client handles auth

---

## 8) Messaging and Positioning

**Positioning:**
- “Automna is the automation layer for your Claude subscription.”
- “Bring your own AI, we provide the hands.”

**Headline:**
- “Don’t just chat with Claude. Put it to work.”

---

## 9) Market Scan: OpenClaw Wrappers
**Status:** Initial scan found hosting providers and setup guides, not true SaaS wrappers.

**What exists:**
- Managed OpenClaw hosting advertised around **$24–$50/mo** for the server layer, plus user model costs of **$20–$60/mo**. All‑in often **$44–$84/mo**.
- DIY VPS hosting spans **$2–$70/mo** plus model costs.
- Most sources emphasize OpenClaw is free software, pricing is hosting plus APIs.

**Implication for Automna:**
- We are not competing on cheap hosting.
- We should position as **managed automation + integrations** and the clean UX.

---

## 10) Long‑Term Technical Strategy

**MCP path is the durable solution.**
- If Automna exposes browser automation as an MCP server, users can use official Claude clients for auth.
- This avoids a fragile OAuth harness and aligns with where the ecosystem is moving.

---

## 11) Open Questions

1) One tier or two at launch
2) How hard to push Max users into the $79 tier
3) Whether the power tier includes always‑on browser or still idle sleep
4) MCP timeline and scope

---

## Appendix: Deep Research Highlights

Key themes from the deep research report:
- BYOK pivot is financially necessary to remove token liability.
- Subscription OAuth is convenient but riskier than API‑key auth.
- Market pricing for hosting suggests $29 platform fee is competitive.
- MCP integration offers the most durable compliance path.

Full report is saved at:
`/root/clawd/projects/automna/research/deep-research-2026-02-12-03-14-34.md`
