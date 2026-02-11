# Automna: Cost Per Action

> Last updated: 2026-02-09
> Based on real usage data from 10 users, ~1,720 LLM requests, 17 phone calls, 15 emails

---

## Cost Per Action (Our Cost)

| Action | Avg Tokens (Input) | Avg Tokens (Output) | Cost to Us | $1 Gets You |
|--------|-------------------|---------------------|------------|-------------|
| **Chat Message** (Opus) | ~21,000 | ~122 | $0.050 | 20 messages |
| **Chat Message** (Power User) | ~113,000 | ~148 | $0.098 | 10 messages |
| **Phone Call** (per minute) | n/a | n/a | $0.090 | 11 minutes |
| **Phone Call** (avg call, 30s) | n/a | n/a | $0.064 | 15 calls |
| **Email Send** | ~21,000 | ~200 | $0.060 | 16 emails |
| **Inbox Check** | ~21,000 | ~150 | $0.050 | 20 checks |
| **Web Search** | ~1 | ~10 | $0.003 | 333 searches |
| **Search + Synthesis** | ~21,000 | ~300 | $0.065 | 15 searches |

### Notes
- **Chat input tokens** are mostly cache reads (~20K) which cost $1.875/M on Opus 4.5
- **Power user** had massive context windows (~113K input avg) doubling the cost
- **Phone calls** cost ~$0.09/min via Bland AI (BYOT mode). Avg call is 30 seconds
- **Email/Inbox** cost is primarily the LLM call to compose/summarize. API send is ~$0.002
- **Web search** alone is $0.003. The cost is the LLM synthesis after
- All LLM costs assume Opus 4.5 pricing ($5/M input, $25/M output, $0.50/M cache read)

---

## Opus 4.5 Token Pricing

| Token Type | Cost per 1M |
|------------|-------------|
| Input (non-cached) | $5.00 |
| Cache Write | $6.25 |
| Cache Read | $0.50 |
| Output | $25.00 |

---

## Tier Budget Model

### Infrastructure Cost Per Tier

| Tier | Machine | RAM | vCPU | Fly Cost/mo | Phone # | Total Infra |
|------|---------|-----|------|-------------|---------|-------------|
| **Lite ($20)** | shared-cpu-1x | 2GB | 1 shared | ~$7 | $1 | **~$8** |
| **Starter ($79)** | shared-cpu-1x | 2GB | 1 shared | ~$7 | $1 | **~$8** |
| **Pro ($149)** | shared-cpu-2x | 4GB | 2 shared | ~$14 | $1 | **~$15** |
| **Business ($299)** | shared-cpu-2x | 4GB | 2 shared | ~$14 | $1 | **~$15** |

> Email inbox cost is negligible. Volume storage (~1GB) adds ~$0.15/mo.

### Budget Breakdown

| | Lite ($20) | Starter ($79) | Pro ($149) | Business ($299) |
|---|---|---|---|---|
| **Revenue** | $20 | $79 | $149 | $299 |
| **Infra cost** | $8 | $8 | $15 | $15 |
| **Budget for usage** | $12 | $71 | $134 | $284 |
| **Cost cap (usage budget)** | $5 | $20 | $100 | $500 |
| **Gross margin** | $7 (35%) | $51 (65%) | $34 (23%) | -$216 (loss at cap) |

> **Note:** Margins assume users hit their full cost cap. Most users use 25-50% of budget,
> so real margins are much higher. See COST-ANALYSIS.md for scenario-based analysis.

### What Each Tier Can Afford (at cost cap)

| Action | Lite ($20) | Starter ($79) | Pro ($149) | Business ($299) |
|--------|-----------|---------------|-----------|-----------------|
| **Messages** | ~100 | ~400 | ~2,000 | ~10,000 |
| **Phone Minutes** | ~55 | ~220 | ~1,100 | ~5,500 |
| **Emails** | ~2,500 | ~10,000 | ~50,000 | ~250,000 |
| **Web Searches** | ~1,650 | ~6,600 | ~33,000 | ~166,000 |

> These are "pure" numbers — if a user ONLY did one action type.
> Real usage is a mix. All usage deducts from a single credit pool.

---

## Automna Credit Costs Per Action

All usage tracked via `usage_events` table. Exchange rate: **10,000 Automna Credits = $1.00**

| Action | Automna Credits | Real Cost |
|--------|----------------|-----------|
| Chat Message (avg) | ~500 | $0.05 |
| Chat Message (power user) | ~1,000+ | $0.10+ |
| Phone Call (per min) | ~900 | $0.09 |
| Email Send | ~20 | $0.002 |
| Web Search | ~30 | $0.003 |
| Search + Synthesis | ~650 | $0.065 |

---

## Current Plan Limits (from `schema.ts` PLAN_LIMITS)

| Tier | Price | Monthly Credits | Cost Cap | Req/min | ~Messages |
|------|-------|----------------|----------|---------|-----------|
| **Lite** | $20 | 50,000 | $5 | 10 | ~100 |
| **Starter** | $79 | 200,000 | $20 | 20 | ~400 |
| **Pro** | $149 | 1,000,000 | $100 | 60 | ~2,000 |
| **Business** | $299 | 5,000,000 | $500 | 120 | ~10,000 |

> Exchange rate: **10,000 Automna Credits = $1.00 real cost**
> Source of truth: `landing/src/lib/db/schema.ts` → `PLAN_LIMITS`
> Tracked in `usage_events` table with `automna_credits` per event.

### Lite ($20) Tier Details

| | Lite ($20) |
|---|---|
| **Monthly Credits** | 50,000 |
| **Cost Cap** | $5 |
| **Req/min** | 10 |
| **~Messages** | ~100 |
| **Features** | Full agent, all integrations, browser, phone, email |
| **Machine** | shared-cpu-1x, 2GB RAM (sleeps when idle) |

---

## Raw Data Sources

### LLM Usage (excluding top power user)
- 797 requests across 9 users
- Avg input tokens (with cache): 20,813
- Avg output tokens: 122
- Avg cost per request: $0.049
- Total cost: $39.07

### Phone Calls
- 17 completed calls
- Avg duration: 30 seconds
- Avg cost: $0.064/call
- Cost per minute: ~$0.09 (Bland AI BYOT)
- Range: $0.03 (12s call) to $0.14 (69s call)

### Machine Specs (Current)
- **Lite/Starter:** shared-cpu-1x, 2GB RAM, 1 vCPU → ~$7/mo
- **Pro/Business:** shared-cpu-2x, 4GB RAM, 2 vCPU → ~$14/mo

### Per-User Daily Usage (normal users)
- Avg messages/day: ~30
- Avg cost/day: ~$1.50
- Avg cost/month (projected): ~$45/mo

### Per-User Daily Usage (power user - Bobby)
- Messages/day: 461
- Cost/day: $45.19
- Cost/month (projected): ~$1,356/mo 🔥
