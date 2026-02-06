# Automna Token System Specification

*Last updated: 2026-02-06*

> **⚠️ MAINTAINER NOTE:** When adding ANY new billable feature to Automna (new API proxy,
> tool integration, service, etc.), you MUST update this document with:
> 1. The real cost of the new service
> 2. The Automna Token conversion rate
> 3. Updated plan budgets if needed
> Failure to do this means the token system will under/overcount and users will see wrong limits.

---

## Overview

Automna Tokens are a **unified virtual currency** that abstracts all real costs into a single,
user-facing metric. Users see "Automna Tokens" everywhere. Internally, each token maps to a
fixed real-dollar cost.

**Why not show real dollars?**
- Users don't want to think about API pricing tiers
- A unified token hides the complexity of 6+ different billing APIs
- We can adjust margins by tuning the exchange rate
- "Tokens" feel natural for an AI product

---

## Exchange Rate

**1 Automna Token = 100 microdollars = $0.0001**

This means:
- $1.00 of real cost = 10,000 Automna Tokens
- $10.00 of real cost = 100,000 Automna Tokens
- $100.00 of real cost = 1,000,000 Automna Tokens (1M)

This rate was chosen so that:
- Plan budgets land in intuitive ranges (200K to 5M)
- Individual actions cost recognizable amounts (a chat message = 50-800 tokens)
- Numbers aren't so big they feel meaningless

---

## Plan Budgets

| Plan | Monthly Price | Cost Cap | Automna Token Budget | Display |
|------|--------------|----------|---------------------|---------|
| **Starter** | $79 | $20 | 200,000 | "200K tokens" |
| **Pro** | $149 | $100 | 1,000,000 | "1M tokens" |
| **Business** | $299 | $500 | 5,000,000 | "5M tokens" |

The token budget = cost cap ÷ $0.0001. If cost caps change, token budgets change proportionally.

---

## Real Costs → Automna Token Conversion

### LLM (Anthropic Claude) — Primary Cost Driver

**Actual Anthropic pricing (as of Feb 2026):**

| Model | Input $/1M | Output $/1M | Cache Write $/1M | Cache Read $/1M |
|-------|-----------|------------|------------------|-----------------|
| **Claude Opus 4.5** | $5.00 | $25.00 | $6.25 (1.25×) | $0.50 (0.1×) |
| **Claude Opus 4** | $15.00 | $75.00 | $18.75 (1.25×) | $1.50 (0.1×) |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | $3.75 (1.25×) | $0.30 (0.1×) |
| **Claude Sonnet 4** | $3.00 | $15.00 | $3.75 (1.25×) | $0.30 (0.1×) |
| **Claude Haiku 4.5** | $1.00 | $5.00 | $1.25 (1.25×) | $0.10 (0.1×) |
| **Claude 3.5 Sonnet** | $3.00 | $15.00 | $3.75 (1.25×) | $0.30 (0.1×) |
| **Claude 3.5 Haiku** | $1.00 | $5.00 | $1.25 (1.25×) | $0.10 (0.1×) |

> **⚠️ CRITICAL:** Our `pricing.ts` currently uses OLD Opus pricing ($15/$75) for
> `claude-opus-4-5`. The correct rate is $5/$25. This means we've been overcharging
> cost calculations by ~3x for Opus 4.5 users. MUST FIX.

**How LLM Automna Tokens are calculated:**

Automna Tokens for LLM requests are NOT a per-message flat fee. They are computed from
the **exact token counts** Anthropic reports for each individual API call:

```
realCost = (inputTokens × modelInputPrice)
         + (outputTokens × modelOutputPrice)
         + (cacheCreationTokens × modelCacheWritePrice)
         + (cacheReadTokens × modelCacheReadPrice)

automnaTokens = ceil(realCost_in_microdollars / 100)
```

This means:
- A request where the model "thinks" for 10K output tokens costs ~50x more than
  a 200-token response, even if the user typed the same input
- Extended thinking tokens are included in `output_tokens` (confirmed by Anthropic docs)
- Long conversation history increases cache read tokens (cheap but nonzero)
- Tool use adds input tokens (tool definitions) and output tokens (tool calls)
- Each request is metered individually — no averaging, no estimates

**Cost varies wildly per request.** A simple "hello" reply might cost 30 Automna Tokens.
A complex reasoning task with extended thinking could cost 5,000+. That's correct and
intentional — heavier work costs more.

**Real example from production data (Opus 4.5, corrected pricing):**

| Actual Request | Output Tokens | Cache Read | Real Cost | Automna Tokens |
|---------------|--------------|------------|-----------|---------------|
| Short reply (8 output) | 8 | 8,000 | ~$0.004 | ~40 |
| Medium reply (141 output) | 141 | 15,000 | ~$0.011 | ~110 |
| Long reply (3,600 output) | 3,600 | 50,000 | ~$0.115 | ~1,150 |
| Heavy thinking (10K output) | 10,000 | 50,000 | ~$0.275 | ~2,750 |

### Voice Calls (Bland.ai + Twilio)

**Actual costs:**

| Component | Cost | Notes |
|-----------|------|-------|
| Bland.ai connected time | $0.09/min | Billed by the second |
| Bland.ai failed/no-answer | $0.015/attempt | Flat fee |
| Twilio number rental | $1.15/month | Per phone number |
| Twilio inbound minutes | $0.0085/min | If using Twilio voice |
| Twilio outbound minutes | $0.014/min | If using Twilio voice |

**Automna Token cost for calls:**

| Activity | Real Cost | Automna Tokens |
|----------|-----------|---------------|
| 1-minute call (connected) | $0.09 | 900 |
| 5-minute call | $0.45 | 4,500 |
| Failed call attempt | $0.015 | 150 |
| Monthly number rental | $1.15 | 11,500 (amortized) |

> **Note on number rental:** The $1.15/month Twilio cost for a phone number is a fixed cost
> we absorb, NOT charged to the user as Automna Tokens. Only per-minute usage counts.

### Email (Agentmail)

**Actual costs:**

| Component | Cost | Notes |
|-----------|------|-------|
| Agentmail subscription | $20/month (Developer) | 10,000 emails/month shared across all users |
| Per-email marginal cost | ~$0.002 | $20 / 10,000 emails |

**Automna Token cost for email:**

| Activity | Real Cost | Automna Tokens |
|----------|-----------|---------------|
| Send 1 email | ~$0.002 | 20 |
| Receive/read 1 email | $0 | 0 (reading is free) |

> **Note:** Agentmail is a flat subscription so per-email cost is approximate.
> As user count grows, we may need to upgrade plans. Revisit when approaching 10K emails/month.

### Web Search (Brave API)

**Actual costs:**

| Plan | Cost | Rate |
|------|------|------|
| Base plan | $3/1,000 queries | $0.003/query |
| Pro plan | $5/1,000 queries | $0.005/query |

We're on the Base plan.

**Automna Token cost for search:**

| Activity | Real Cost | Automna Tokens |
|----------|-----------|---------------|
| 1 web search query | $0.003 | 30 |

### Browser Automation (Browserbase)

**Actual costs:**

| Plan | Cost | Rate |
|------|------|------|
| Developer ($20/mo) | 100 hours included | $0.002/min included |
| Overage | $0.12/hour | $0.002/min overage |

**Automna Token cost for browser:**

| Activity | Real Cost | Automna Tokens |
|----------|-----------|---------------|
| 1-minute browser session | ~$0.002 | 20 |
| 10-minute browser session | ~$0.02 | 200 |
| 1-hour browser session | ~$0.12 | 1,200 |

> **Note:** Browserbase cost is tricky because we have included hours. Once those
> are exhausted, overage kicks in. For simplicity, charge a flat rate per minute.

### Gemini (Embeddings & Tools)

**Actual costs (Gemini 2.5 Flash-Lite, used for embeddings):**

| Component | Cost |
|-----------|------|
| Input | $0.10/1M tokens |
| Output | $0.40/1M tokens |

**Automna Token cost:**

| Activity | Real Cost | Automna Tokens |
|----------|-----------|---------------|
| 1 embedding request (~500 tokens) | ~$0.00005 | ~1 |

Gemini embeddings are essentially free. Minimum 1 Automna Token per request.

---

## Summary: Cost Per Activity

Quick reference for all billable activities:

| Activity | Automna Tokens | How Measured |
|----------|---------------|-------------|
| **LLM request** | 30 - 5,000+ | Exact cost from Anthropic's reported token counts (input, output, thinking, cache) |
| **Web search** | 30 | Per query |
| **Browser session** | 20/min | Per minute active |
| **Phone call** | 900/min | Per minute connected |
| **Failed call attempt** | 150 | Per attempt |
| **Email sent** | 20 | Per email |
| **Email read** | 0 | Free |
| **Embedding** | 1 | Per request |

> **LLM is the only variable-cost item.** Everything else has a fixed per-unit rate.
> LLM cost depends entirely on what the model actually does for each request (thinking
> time, response length, conversation history size, tool use, etc.).

### What does a plan budget feel like?

These are rough guides based on observed production usage patterns. Actual cost per
request varies significantly based on model thinking time, conversation length, and
tool use.

**Starter (200K tokens = $20 real cost):**
- Enough for moderate daily chat use for 2-3 weeks (Sonnet) or 1-2 weeks (Opus)
- OR ~220 minutes of phone calls
- OR ~6,600 web searches
- Heavy thinkers or long conversations burn through faster

**Pro (1M tokens = $100 real cost):**
- Enough for heavy daily use all month on Sonnet, or moderate on Opus
- OR ~1,100 minutes of phone calls
- Realistic for power users who chat throughout the day

**Business (5M tokens = $500 real cost):**
- Enough for multiple agents running continuously
- OR ~5,500 minutes of phone calls
- For teams or heavy automation workflows

---

## Implementation Notes

### How to calculate Automna Tokens for an LLM request

```typescript
function toAutomnaTokens(costMicrodollars: number): number {
  return Math.ceil(costMicrodollars / 100);
}
```

The `costMicrodollars` comes from the existing `calculateCostMicrodollars()` function
in `pricing.ts`, which already accounts for all token types (input, output, cache write,
cache read) at their correct per-model rates.

### What needs to change

1. **Fix `pricing.ts`**: Update Opus 4.5 pricing from $15/$75 to $5/$25
2. **Add Automna Token column**: Add `automna_tokens` column to `llm_usage` table
   (or compute it on-the-fly from `cost_microdollars`)
3. **Update `/api/llm/usage` endpoint**: Return `automnaTokens` used/remaining instead
   of raw token counts
4. **Update `UsageBanner.tsx`**: Display Automna Tokens instead of raw tokens
5. **Update rate limiter**: Check cost-based limits (via Automna Tokens) instead of
   raw token sums
6. **Add non-LLM usage logging**: Log email sends, calls, searches, browser sessions
   to a unified `usage_events` table with their Automna Token cost
7. **Reset all current usage data**: Wipe `llm_usage` for current month (data is
   unreliable due to pricing bug)

### Storage approach

**Option A: Compute on the fly (recommended for now)**
- Automna Tokens = `ceil(cost_microdollars / 100)` 
- No schema changes needed
- Monthly usage query: `SELECT ceil(SUM(cost_microdollars) / 100) FROM llm_usage WHERE ...`

**Option B: Unified events table (for when we add non-LLM billing)**
```sql
CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,  -- 'llm', 'call', 'email', 'search', 'browser'
  automna_tokens INTEGER NOT NULL,
  cost_microdollars INTEGER NOT NULL,
  metadata TEXT,  -- JSON: model, call_id, etc.
);
```

Start with Option A. Move to Option B when we add call/email/search billing.

### Display to users

**Usage banner:** "You've used 150K of 1M tokens this month"
**Usage page:** Break down by category (Chat: 140K, Calls: 8K, Search: 2K)
**Pricing page:** "Starter: 200K tokens/month" (no mention of dollars)

Users never see dollars, microdollars, or raw API token counts. Just Automna Tokens.

---

## Pricing Bugs Found (2026-02-06)

1. **Opus 4.5 priced as Opus 4**: `pricing.ts` has `claude-opus-4-5` at $15/$75 input/output.
   Correct price is $5/$25. This means ALL historical cost data for Opus 4.5 users is
   ~3x too high. Affects: cost tracking, rate limiting, usage display.

2. **Cache tokens counted toward token limit**: The rate limiter and usage endpoint sum
   `input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens` for the
   monthly token cap. Cache tokens are 99%+ of this sum for most users, inflating
   apparent usage by ~160x. With the Automna Token system, this is fixed automatically
   because we use cost (which weights cache tokens correctly) instead of raw counts.

3. **No non-LLM usage tracking**: Calls, emails, searches, and browser sessions are not
   currently metered against the user's budget. These are small costs today but will
   matter as features grow.

---

## Future Considerations

- **Model-specific multipliers**: If we offer model choice (Sonnet vs Opus), users should
  understand Opus costs more tokens. The cost-based system handles this automatically.
- **Free tier**: Could offer 10K-20K Automna Tokens (= $1-2 real cost) for trial.
- **Token top-ups**: Allow purchasing additional tokens mid-month.
- **Usage alerts**: Notify at 50%, 80%, 100% of budget.
- **Rate adjustments**: If Anthropic changes pricing, update `pricing.ts` and this doc.
  The Automna Token exchange rate ($0.0001) stays fixed; only internal cost calculations change.
