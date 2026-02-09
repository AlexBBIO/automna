# Automna: Cost Per Action

> Last updated: 2026-02-09
> Based on real usage data from 10 users, ~1,720 LLM requests, 17 phone calls, 15 emails

---

## Cost Per Action (Our Cost)

| Action | Avg Tokens (Input) | Avg Tokens (Output) | Cost to Us | $1 Gets You |
|--------|-------------------|---------------------|------------|-------------|
| **Chat Message** (Opus) | ~21,000 | ~122 | $0.050 | 20 messages |
| **Chat Message** (Power User) | ~113,000 | ~148 | $0.098 | 10 messages |
| **Phone Call** (per minute) | n/a | n/a | $0.125 | 8 minutes |
| **Phone Call** (avg call, 1min) | n/a | n/a | $0.125 | 15 calls |
| **Email Send** | ~21,000 | ~200 | $0.060 | 16 emails |
| **Inbox Check** | ~21,000 | ~150 | $0.050 | 20 checks |
| **Web Search** | ~1 | ~10 | $0.001 | 1,000 searches |
| **Search + Synthesis** | ~21,000 | ~300 | $0.065 | 15 searches |

### Notes
- **Chat input tokens** are mostly cache reads (~20K) which cost $1.875/M on Opus 4.5
- **Power user** had massive context windows (~113K input avg) doubling the cost
- **Phone calls** cost ~$0.12/min via Bland AI (BYOT mode). Avg call is 30 seconds
- **Email/Inbox** cost is primarily the LLM call to compose/summarize. API send is free
- **Web search** alone is near-free ($0.001). The cost is the LLM synthesis after
- All LLM costs assume Opus 4.5 pricing ($15/M input, $75/M output, $1.875/M cache read)

---

## Opus 4.5 Token Pricing

| Token Type | Cost per 1M |
|------------|-------------|
| Input (non-cached) | $15.00 |
| Cache Write | $18.75 |
| Cache Read | $1.875 |
| Output | $75.00 |

---

## Tier Budget Model

### Infrastructure Cost Per Tier

| Tier | Machine | RAM | vCPU | Fly Cost/mo | Phone # | Total Infra |
|------|---------|-----|------|-------------|---------|-------------|
| **Lite ($20)** | shared-cpu-1x | 2GB | 1 shared | ~$7 | $1 | **~$8** |
| **Pro ($79)** | shared-cpu-2x | 4GB | 2 shared | ~$14 | $1 | **~$15** |
| **Business ($149)** | shared-cpu-2x | 4GB | 2 shared | ~$14 | $1 | **~$15** |
| **Enterprise ($299)** | shared-cpu-2x | 4GB | 2 shared | ~$14 | $1 | **~$15** |

> Email inbox cost is negligible. Volume storage (~1GB) adds ~$0.15/mo.

### Budget Breakdown

| | Lite ($20) | Pro ($79) | Business ($149) | Enterprise ($299) |
|---|---|---|---|---|
| **Revenue** | $20 | $79 | $149 | $299 |
| **Infra cost** | $8 | $15 | $15 | $15 |
| **Budget for usage** | $12 | $64 | $134 | $284 |
| **Target margin** | ~0% | ~50% | ~60% | ~65% |
| **Usage budget (at margin)** | $12 | $32 | $54 | $99 |

### What Each Tier Can Afford (at target margin)

| Action | Lite ($20) | Pro ($79) | Business ($149) | Enterprise ($299) |
|--------|-----------|----------|----------------|-------------------|
| **Messages** | 240 | 640 | 1,080 | 1,980 |
| **Phone Minutes** | 10 | 26 | 43 | 79 |
| **Emails** | 200 | 533 | 900 | 1,650 |

> These are "pure" numbers — if a user ONLY did one action type.
> Real usage is a mix, so actual limits should be expressed as a shared token/credit pool.

---

## Shared Credit Pool Model

If we define **1 credit = $0.01 of cost to us**:

| Action | Credits Per Use |
|--------|----------------|
| Chat Message | 5 credits |
| Phone Call (per min) | 13 credits |
| Email Send | 6 credits |
| Inbox Check | 5 credits |
| Web Search (with synthesis) | 7 credits |

| Tier | Monthly Automna Tokens | Rough Equivalent |
|------|----------------------|------------------|
| **Lite ($20)** | 120,000 | ~240 messages OR ~10 phone min OR mix |
| **Pro ($79)** | 320,000 | ~640 messages OR ~26 phone min OR mix |
| **Business ($149)** | 540,000 | ~1,080 messages OR ~43 phone min OR mix |
| **Enterprise ($299)** | 990,000 | ~1,980 messages OR ~79 phone min OR mix |

> Exchange rate: **10,000 Automna Tokens = $1.00 real cost**
> Already tracked in `usage_events` table with `automna_tokens` per event.

---

## Automna Token Costs Per Action

Already tracked via `usage_events` table. Exchange rate: **10,000 AT = $1.00**

| Action | Automna Tokens | Real Cost |
|--------|---------------|-----------|
| Chat Message (avg) | ~500-770 | $0.05-0.08 |
| Chat Message (power user) | ~1,000+ | $0.10+ |
| Phone Call (per min) | ~1,250 | $0.125 |
| Email Send | ~20 | $0.002 |
| Web Search | ~28 | $0.003 |
| Search + Synthesis | ~650 | $0.065 |

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
- Cost per minute: ~$0.125 (Bland AI BYOT)
- Range: $0.03 (12s call) to $0.14 (69s call)

### Machine Specs (Current)
- **Starter/Lite:** shared-cpu-1x, 2GB RAM, 1 vCPU → ~$7/mo
- **Pro:** shared-cpu-2x, 4GB RAM, 2 vCPU → ~$14/mo
- **Business:** shared-cpu-2x, 4GB RAM, 2 vCPU → ~$14/mo

### Per-User Daily Usage (normal users)
- Avg messages/day: ~30
- Avg cost/day: ~$1.50
- Avg cost/month (projected): ~$45/mo

### Per-User Daily Usage (power user - Bobby)
- Messages/day: 461
- Cost/day: $45.19
- Cost/month (projected): ~$1,356/mo 🔥
