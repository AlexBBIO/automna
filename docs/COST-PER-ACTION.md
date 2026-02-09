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

### Assumptions
- Infrastructure per user: ~$10/mo (Fly machine + phone number + email)
- Target margin: 50%+ on higher tiers, breakeven/slim on Lite

| | Lite ($20) | Pro ($79) | Business ($149) | Enterprise ($299) |
|---|---|---|---|---|
| **Infra cost** | $10 | $10 | $10 | $10 |
| **Budget for usage** | $10 | $69 | $139 | $289 |
| **Target margin** | ~0% | ~50% | ~60% | ~65% |
| **Usage budget (at margin)** | $10 | $35 | $56 | $101 |

### What Each Tier Can Afford (at target margin)

| Action | Lite ($20) | Pro ($79) | Business ($149) | Enterprise ($299) |
|--------|-----------|----------|----------------|-------------------|
| **Messages** | 200 | 700 | 1,120 | 2,020 |
| **Phone Minutes** | 8 | 28 | 45 | 81 |
| **Emails** | 167 | 583 | 933 | 1,683 |

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

| Tier | Monthly Credits | Rough Equivalent |
|------|----------------|------------------|
| **Lite ($20)** | 1,000 | ~200 messages OR ~77 phone minutes OR mix |
| **Pro ($79)** | 3,500 | ~700 messages OR ~269 phone minutes OR mix |
| **Business ($149)** | 5,600 | ~1,120 messages OR ~431 phone minutes OR mix |
| **Enterprise ($299)** | 10,100 | ~2,020 messages OR ~777 phone minutes OR mix |

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

### Per-User Daily Usage (normal users)
- Avg messages/day: ~30
- Avg cost/day: ~$1.50
- Avg cost/month (projected): ~$45/mo

### Per-User Daily Usage (power user - Bobby)
- Messages/day: 461
- Cost/day: $45.19
- Cost/month (projected): ~$1,356/mo 🔥
