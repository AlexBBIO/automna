# Automna Cost Analysis
*Last updated: 2026-02-04*

## Subscription Pricing

| Tier | Price/month | Token Limit | Cost Cap |
|------|-------------|-------------|----------|
| Starter | $79 | 2M | $20 |
| Pro | $149 | 10M | $100 |
| Business | $299 | 50M | $500 |

---

## Fixed Costs (Per User)

These costs are incurred regardless of usage:

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| **Fly.io Machine** | ~$9.50 | 2GB RAM, 1 shared vCPU |
| **Fly.io Volume** | $0.15 | 1GB encrypted storage |
| **Total Fixed** | **~$10/user** | |

### Fly.io Breakdown
- Shared CPU (1x): ~$5.70/month
- RAM (2GB @ $1.86/GB): ~$3.72/month
- Volume (1GB @ $0.15/GB): $0.15/month

---

## Variable Costs (API Usage)

### Anthropic LLM (Primary Cost Driver)

**Claude Opus 4.5 Pricing:**
- Input: $15/1M tokens
- Output: $75/1M tokens

**Blended Rate Calculation:**
Typical chat ratio is ~35% input / 65% output:
- 350K input × $15/1M = $5.25
- 650K output × $75/1M = $48.75
- **Blended: ~$54/1M tokens**

**Important:** The cost cap is the binding constraint, not the token limit.

| Tier | Cost Cap | Effective Token Budget | Notes |
|------|----------|------------------------|-------|
| Starter | $20 | ~370K tokens | Hits cap before 2M limit |
| Pro | $100 | ~1.85M tokens | Hits cap before 10M limit |
| Business | $500 | ~9.2M tokens | Hits cap before 50M limit |

**Actual LLM cost per user:**
- Light user (hits ~25% of cap): $5-25
- Moderate user (hits ~50% of cap): $10-50
- Heavy user (hits cap): $20-$500 (capped)

### Other APIs

| Service | Pricing | Est. Light | Est. Moderate | Est. Heavy |
|---------|---------|------------|---------------|------------|
| **Gemini** (embeddings) | $0.00013/1K tokens | $0.10 | $0.30 | $0.50 |
| **Browserbase** | $0.10/browser hour | $0.10 | $0.50 | $3.00 |
| **Brave Search** | $0.005/query | $0.10 | $0.50 | $1.50 |
| **Agentmail** | ~$0.01/email | $0.20 | $1.00 | $5.00 |
| **Subtotal (other APIs)** | | **$0.50** | **$2.30** | **$10.00** |

---

## Cost Scenarios by Tier

### Starter ($79/month)

| Scenario | Fixed | LLM | Other APIs | Total Cost | Margin |
|----------|-------|-----|------------|------------|--------|
| **Light user** | $10 | $5 | $0.50 | $15.50 | **$63.50 (80%)** |
| **Moderate** | $10 | $12 | $1.50 | $23.50 | **$55.50 (70%)** |
| **Heavy (capped)** | $10 | $20 | $3.00 | $33.00 | **$46.00 (58%)** |

### Pro ($149/month)

| Scenario | Fixed | LLM | Other APIs | Total Cost | Margin |
|----------|-------|-----|------------|------------|--------|
| **Light user** | $10 | $25 | $1.00 | $36.00 | **$113.00 (76%)** |
| **Moderate** | $10 | $50 | $3.00 | $63.00 | **$86.00 (58%)** |
| **Heavy (capped)** | $10 | $100 | $6.00 | $116.00 | **$33.00 (22%)** |

### Business ($299/month)

| Scenario | Fixed | LLM | Other APIs | Total Cost | Margin |
|----------|-------|-----|------------|------------|--------|
| **Light user** | $10 | $100 | $2.00 | $112.00 | **$187.00 (63%)** |
| **Moderate** | $10 | $250 | $5.00 | $265.00 | **$34.00 (11%)** |
| **Heavy (capped)** | $10 | $500 | $10.00 | $520.00 | **-$221.00 (LOSS)** |

---

## Summary: Expected Ranges

Based on typical usage distribution (most users are light-to-moderate):

| Tier | Revenue | Cost Range | Expected Margin |
|------|---------|------------|-----------------|
| **Starter** | $79 | $15-33 | **$46-64 (58-80%)** |
| **Pro** | $149 | $36-116 | **$33-113 (22-76%)** |
| **Business** | $299 | $112-520 | **-$221 to +$187** |

### Key Insights

1. **Starter is highly profitable** — even heavy users generate 58% margins
2. **Pro is sustainable** — moderate users are profitable, heavy users cut margins
3. **Business is risky** — heavy users can be unprofitable; need usage monitoring

---

## Cost Mitigation Strategies

### Already Implemented
- ✅ Per-minute rate limits (prevents burst abuse)
- ✅ Monthly cost caps (hard ceiling on LLM spend)
- ✅ All APIs proxied (full visibility)
- ✅ Usage tracking in Turso

### Recommended
1. **Lower cost caps** for Business tier (e.g., $350 instead of $500)
2. **Usage alerts** when users hit 80% of caps
3. **Sonnet fallback** for non-critical tasks (3-5x cheaper than Opus)
4. **Caching** for repeated/similar queries
5. **Monitor Browserbase** — heavy automation users could spike costs

---

## Break-Even Analysis

| Tier | Break-Even Cost | At Current Cap |
|------|-----------------|----------------|
| Starter | $79 | $33 (capped at $33) ✅ |
| Pro | $149 | $116 (capped at $116) ✅ |
| Business | $299 | $520 (exceeds at heavy usage) ⚠️ |

**Recommendation:** Reduce Business cost cap from $500 to $280 to ensure profitability.

---

## Monthly Baseline (10 Users Example)

Assuming typical distribution: 60% light, 30% moderate, 10% heavy

**Starter (10 users @ $79 each = $790 revenue):**
- 6 light × $15.50 = $93
- 3 moderate × $23.50 = $70.50
- 1 heavy × $33.00 = $33
- **Total cost: $196.50 → Margin: $593.50 (75%)**

**Pro (10 users @ $149 each = $1,490 revenue):**
- 6 light × $36 = $216
- 3 moderate × $63 = $189
- 1 heavy × $116 = $116
- **Total cost: $521 → Margin: $969 (65%)**

**Business (10 users @ $299 each = $2,990 revenue):**
- 6 light × $112 = $672
- 3 moderate × $265 = $795
- 1 heavy × $520 = $520
- **Total cost: $1,987 → Margin: $1,003 (34%)**

---

## Conclusion

**Overall health:** Good unit economics on Starter/Pro, Business needs monitoring.

| Tier | Verdict |
|------|---------|
| Starter | ✅ Excellent margins (58-80%) |
| Pro | ✅ Good margins for most users (22-76%) |
| Business | ⚠️ Risk of loss on heavy users — reduce cap |

**Blended margin target:** 50-65% across all tiers, assuming typical usage distribution.
