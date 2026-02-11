# Automna Cost Analysis
*Last updated: 2026-02-09*

## Subscription Pricing

| Tier | Price/month | Annual (20% off) | Credit Budget | Cost Cap |
|------|-------------|-------------------|---------------|----------|
| Lite | $20 | $16/mo | 50K | $5 |
| Starter | $79 | $63/mo | 200K | $20 |
| Pro | $149 | $119/mo | 1M | $100 |
| Business | $299 | $239/mo | 5M | $500 |

**Exchange rate:** 10,000 Automna Credits = $1.00 real cost

---

## Fixed Costs (Per User)

These costs are incurred regardless of usage:

| Component | Lite/Starter | Pro/Business | Notes |
|-----------|-------------|-------------|-------|
| **Fly.io Machine** | ~$7 | ~$14 | Lite/Starter: shared-cpu-1x 2GB; Pro/Business: shared-cpu-2x 4GB |
| **Fly.io Volume** | $0.15 | $0.15 | 1GB encrypted storage |
| **Twilio Number** | $1.15 | $1.15 | Per phone number |
| **Total Fixed** | **~$8** | **~$15** | |

### Fly.io Breakdown
- Lite/Starter: shared-cpu-1x (~$5.70/mo) + 2GB RAM (~$1.30/mo) = ~$7/mo
- Pro/Business: shared-cpu-2x (~$11.40/mo) + 4GB RAM (~$2.60/mo) = ~$14/mo
- Volume (1GB @ $0.15/GB): $0.15/month
- Lite machines sleep when idle (lower effective cost)

---

## Variable Costs (API Usage)

### Anthropic LLM (Primary Cost Driver)

**Claude Opus 4.5 Pricing (corrected Feb 2026):**
- Input: $5/1M tokens
- Output: $25/1M tokens
- Cache Read: $0.50/1M tokens
- Cache Write: $6.25/1M tokens

**Average message cost from production data:** ~$0.05 (500 Automna Credits)

The cost cap is the binding constraint. Credit budgets are derived directly from cost caps:

| Tier | Cost Cap | Credit Budget | ~Messages at avg cost |
|------|----------|---------------|----------------------|
| Lite | $5 | 50,000 | ~100 |
| Starter | $20 | 200,000 | ~400 |
| Pro | $100 | 1,000,000 | ~2,000 |
| Business | $500 | 5,000,000 | ~10,000 |

### Other APIs

| Service | Unit Cost | Credits | Light Use | Moderate Use | Heavy Use |
|---------|-----------|---------|-----------|--------------|-----------|
| **Phone Call** | $0.09/min | 900/min | $0.50 | $2.00 | $5.00 |
| **Email Send** | $0.002 | 20 | $0.10 | $0.50 | $2.00 |
| **Web Search** | $0.003 | 30 | $0.10 | $0.50 | $1.50 |
| **Browser** | $0.002/min | 20/min | $0.10 | $0.50 | $3.00 |
| **Embedding** | ~$0.00005 | 1 | ~$0 | ~$0 | ~$0 |
| **Subtotal** | | | **$0.80** | **$3.50** | **$11.50** |

---

## Cost Scenarios by Tier

### Lite ($20/month)

| Scenario | Fixed | LLM | Other APIs | Total Cost | Margin |
|----------|-------|-----|------------|------------|--------|
| **Light user** | $8 | $2 | $0.30 | $10.30 | **$9.70 (49%)** |
| **Moderate** | $8 | $3.50 | $0.80 | $12.30 | **$7.70 (39%)** |
| **Heavy (capped)** | $8 | $5 | $1.50 | $14.50 | **$5.50 (28%)** |

### Starter ($79/month)

| Scenario | Fixed | LLM | Other APIs | Total Cost | Margin |
|----------|-------|-----|------------|------------|--------|
| **Light user** | $8 | $5 | $0.50 | $13.50 | **$65.50 (83%)** |
| **Moderate** | $8 | $12 | $1.50 | $21.50 | **$57.50 (73%)** |
| **Heavy (capped)** | $8 | $20 | $3.00 | $31.00 | **$48.00 (61%)** |

### Pro ($149/month)

| Scenario | Fixed | LLM | Other APIs | Total Cost | Margin |
|----------|-------|-----|------------|------------|--------|
| **Light user** | $15 | $25 | $1.00 | $41.00 | **$108.00 (72%)** |
| **Moderate** | $15 | $50 | $3.00 | $68.00 | **$81.00 (54%)** |
| **Heavy (capped)** | $15 | $100 | $6.00 | $121.00 | **$28.00 (19%)** |

### Business ($299/month)

| Scenario | Fixed | LLM | Other APIs | Total Cost | Margin |
|----------|-------|-----|------------|------------|--------|
| **Light user** | $15 | $100 | $2.00 | $117.00 | **$182.00 (61%)** |
| **Moderate** | $15 | $250 | $5.00 | $270.00 | **$29.00 (10%)** |
| **Heavy (capped)** | $15 | $500 | $10.00 | $525.00 | **-$226.00 (LOSS)** |

---

## Summary: Expected Ranges

Based on typical usage distribution (most users are light-to-moderate):

| Tier | Revenue | Cost Range | Expected Margin |
|------|---------|------------|-----------------|
| **Lite** | $20 | $10-15 | **$5-10 (28-49%)** |
| **Starter** | $79 | $14-31 | **$48-66 (61-83%)** |
| **Pro** | $149 | $41-121 | **$28-108 (19-72%)** |
| **Business** | $299 | $117-525 | **-$226 to +$182** |

### Key Insights

1. **Lite is thin-margin but safe** — even heavy users are profitable thanks to low $5 cost cap
2. **Starter is highly profitable** — even heavy users generate 61% margins
3. **Pro is sustainable** — moderate users are profitable, heavy users cut margins but stay positive
4. **Business is risky** — heavy users can be unprofitable; need usage monitoring

---

## Cost Mitigation Strategies

### Already Implemented
- ✅ Per-minute rate limits (prevents burst abuse)
- ✅ Monthly cost caps via Automna Credits (hard ceiling on spend)
- ✅ All APIs proxied (full visibility)
- ✅ Usage tracking in Turso via `usage_events` table
- ✅ Single credit pool for all usage types

### Recommended
1. **Usage alerts** when users hit 50%, 80%, 100% of credit budget
2. **Sonnet fallback** for non-critical tasks (3-5x cheaper than Opus)
3. **Caching** for repeated/similar queries
4. **Monitor Browserbase** — heavy automation users could spike costs
5. **BYOK for Business** — encourage heavy Business users to bring own API keys

---

## Break-Even Analysis

| Tier | Revenue | Max Cost (at cap) | Profitable? |
|------|---------|-------------------|-------------|
| Lite | $20 | $14.50 | ✅ Always |
| Starter | $79 | $31.00 | ✅ Always |
| Pro | $149 | $121.00 | ✅ Always |
| Business | $299 | $525.00 | ⚠️ Loss at cap |

**Recommendation:** Monitor Business tier closely. Consider reducing cost cap from $500 to $280
to ensure profitability, or require BYOK for heavy Business users.

---

## Monthly Baseline (10 Users Per Tier Example)

Assuming typical distribution: 60% light, 30% moderate, 10% heavy

**Lite (10 users @ $20 each = $200 revenue):**
- 6 light × $10.30 = $61.80
- 3 moderate × $12.30 = $36.90
- 1 heavy × $14.50 = $14.50
- **Total cost: $113.20 → Margin: $86.80 (43%)**

**Starter (10 users @ $79 each = $790 revenue):**
- 6 light × $13.50 = $81
- 3 moderate × $21.50 = $64.50
- 1 heavy × $31.00 = $31
- **Total cost: $176.50 → Margin: $613.50 (78%)**

**Pro (10 users @ $149 each = $1,490 revenue):**
- 6 light × $41 = $246
- 3 moderate × $68 = $204
- 1 heavy × $121 = $121
- **Total cost: $571 → Margin: $919 (62%)**

**Business (10 users @ $299 each = $2,990 revenue):**
- 6 light × $117 = $702
- 3 moderate × $270 = $810
- 1 heavy × $525 = $525
- **Total cost: $2,037 → Margin: $953 (32%)**

---

## Conclusion

**Overall health:** Good unit economics on Lite/Starter/Pro, Business needs monitoring.

| Tier | Verdict |
|------|---------|
| Lite | ✅ Safe margins (28-49%) — low cap prevents losses |
| Starter | ✅ Excellent margins (61-83%) — best economics |
| Pro | ✅ Good margins for most users (19-72%) |
| Business | ⚠️ Risk of loss on heavy users — reduce cap or require BYOK |

**Blended margin target:** 50-65% across all tiers, assuming typical usage distribution.
