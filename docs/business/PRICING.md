# Pricing

> Last updated: 2026-02-11

## Current Tiers

| Plan | Price | Credit Budget | RPM | Call Minutes | Key Traits |
|------|-------|--------------|-----|-------------|------------|
| Lite | $20/mo | 50K | 10 | 30 min/mo | Sleeps when idle |
| Starter | $79/mo | 200K | 20 | 60 min/mo | Always-on, proactive monitoring, long-term memory |
| Pro | $149/mo | 1M | 60 | 120 min/mo | Higher limits, custom skills, email support |
| Business | $299/mo | 5M | 120 | 300 min/mo | Highest limits, API access, analytics, dedicated support |

## Strategy

All tiers are **feature-identical** (Opus, phone, email, browser, all integrations). Differentiate ONLY on usage limits. Full experience + tight limits → "I want more" → upgrades.

## Cost Structure

- **Infra per user:** ~$10/mo (Fly machine + phone number + email)
- **Cost per message:** ~$0.05 (Opus, normal) / ~$0.10 (power user, large context)
- **Cost per phone minute:** ~$0.125 (Bland AI BYOT)
- **Detailed analysis:** `../infrastructure/COST-ANALYSIS.md` and `../infrastructure/COST-PER-ACTION.md`

## Stripe Integration

- Products/prices configured in Stripe
- Checkout via `/api/checkout`
- Billing portal via `/api/billing/portal`
- Webhooks handle: `checkout.session.completed`, `subscription.updated`, `subscription.deleted`
- Plan stored in Clerk `publicMetadata.plan`
