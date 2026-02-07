# Automna Token System — Implementation Spec

*Created: 2026-02-07*
*Parent doc: [AUTOMNA-TOKENS.md](./AUTOMNA-TOKENS.md) (system design & cost research)*

> **⚠️ This is a BIG change.** It touches pricing, rate limiting, usage tracking, every API
> proxy, the frontend, the admin dashboard, and the pricing page. Read fully before coding.
> Test each phase before moving to the next.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase 1: Fix Pricing & Reset Data](#2-phase-1-fix-pricing--reset-data)
3. [Phase 2: New Usage Schema](#3-phase-2-new-usage-schema)
4. [Phase 3: Update LLM Proxy Logging](#4-phase-3-update-llm-proxy-logging)
5. [Phase 4: Add Logging to Non-LLM Proxies](#5-phase-4-add-logging-to-non-llm-proxies)
6. [Phase 5: Update Rate Limiter](#6-phase-5-update-rate-limiter)
7. [Phase 6: Update Usage API Endpoint](#7-phase-6-update-usage-api-endpoint)
8. [Phase 7: Update Frontend](#8-phase-7-update-frontend)
9. [Phase 8: Update Admin Dashboard](#9-phase-8-update-admin-dashboard)
10. [Phase 9: Update Pricing Page & Plan Limits](#10-phase-9-update-pricing-page--plan-limits)
11. [Phase 10: Verification & Cleanup](#11-phase-10-verification--cleanup)
12. [File-by-File Change List](#12-file-by-file-change-list)
13. [Testing Checklist](#13-testing-checklist)
14. [Rollback Plan](#14-rollback-plan)

---

## 1. Overview

### What we're building
A unified "Automna Token" billing system where **1 Automna Token = $0.0001 real cost
(100 microdollars)**. All billable activities (LLM, calls, email, search, browser) contribute
to a single monthly token budget. Users see Automna Tokens everywhere; they never see
raw dollars or API token counts.

### Why
- Current token counting is broken (cache tokens inflate usage 160x)
- Opus 4.5 pricing is wrong ($15/$75 instead of $5/$25)
- Non-LLM services (calls, email, search, browser) aren't metered against user budgets
- Users need one clear number to understand their usage

### Core formula
```
automnaTokens = ceil(costMicrodollars / 100)
```

### Plan budgets (Automna Tokens per month)

| Plan | Cost Cap | Budget | Display |
|------|----------|--------|---------|
| Starter | $20 | 200,000 | "200K" |
| Pro | $100 | 1,000,000 | "1M" |
| Business | $500 | 5,000,000 | "5M" |

---

## 2. Phase 1: Fix Pricing & Reset Data

**Goal:** Fix the Opus 4.5 pricing bug and wipe unreliable historical data.

### 2a. Fix `pricing.ts`

**File:** `landing/src/app/api/llm/_lib/pricing.ts`

Update model pricing:

```typescript
// BEFORE (wrong)
"claude-opus-4-5": makePricing(15.0, 75.0),
"claude-opus-4-5-20250514": makePricing(15.0, 75.0),

// AFTER (correct)
"claude-opus-4-5": makePricing(5.0, 25.0),
"claude-opus-4-5-20250514": makePricing(5.0, 25.0),
```

Also add any missing models:
```typescript
"claude-opus-4-6": makePricing(5.0, 25.0),        // If exists
"claude-opus-4-6-20260101": makePricing(5.0, 25.0), // Date variant
```

### 2b. Reset usage data

Run against Turso:
```sql
-- Delete all LLM usage records for current month
-- (data is unreliable due to pricing bug + cache inflation)
DELETE FROM llm_usage
WHERE timestamp >= strftime('%s', date('now', 'start of month'));

-- Also reset rate limit counters
DELETE FROM llm_rate_limits;
```

> **Decision point:** Do we also wipe email_sends and call_usage? Probably not — those
> tables are structurally correct, just not connected to Automna Token budgets yet.

### 2c. Deploy pricing fix

Deploy to Vercel BEFORE doing anything else. From this point forward, all new LLM usage
is logged with correct costs.

---

## 3. Phase 2: New Usage Schema

**Goal:** Create a unified `usage_events` table that captures ALL billable activity.

### 3a. New table: `usage_events`

**File:** `landing/src/lib/db/schema.ts`

```typescript
export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  timestamp: integer("timestamp").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),

  // Event classification
  eventType: text("event_type").notNull(),
  // Values: 'llm' | 'search' | 'browser' | 'call' | 'email' | 'embedding'

  // Automna Token cost (THE key field)
  automnaTokens: integer("automna_tokens").notNull().default(0),

  // Underlying real cost in microdollars (for internal tracking / margin analysis)
  costMicrodollars: integer("cost_microdollars").notNull().default(0),

  // Metadata (JSON) - varies by event type
  // LLM: { model, inputTokens, outputTokens, cacheCreate, cacheRead, provider, sessionKey }
  // Search: { query, resultCount }
  // Browser: { sessionId, durationMs }
  // Call: { blandCallId, direction, toNumber, fromNumber, durationSeconds }
  // Email: { recipient, subject }
  // Embedding: { model, tokens }
  metadata: text("metadata"),

  // Optional error tracking
  error: text("error"),
}, (table) => ({
  userTimestampIdx: index("idx_usage_events_user_ts").on(table.userId, table.timestamp),
  eventTypeIdx: index("idx_usage_events_type").on(table.eventType),
}));
```

### 3b. Update PLAN_LIMITS

Replace token/cost limits with Automna Token budgets:

```typescript
export const PLAN_LIMITS = {
  free: {
    monthlyAutomnaTokens: 10_000,       // $1 worth (trial)
    requestsPerMinute: 5,
    monthlyCallMinutes: 0,
  },
  starter: {
    monthlyAutomnaTokens: 200_000,      // $20 cost cap
    requestsPerMinute: 20,
    monthlyCallMinutes: 0,
  },
  pro: {
    monthlyAutomnaTokens: 1_000_000,    // $100 cost cap
    requestsPerMinute: 60,
    monthlyCallMinutes: 60,
  },
  business: {
    monthlyAutomnaTokens: 5_000_000,    // $500 cost cap
    requestsPerMinute: 120,
    monthlyCallMinutes: 300,
  },
} as const;
```

> **Note:** `monthlyTokens` and `monthlyCostCents` are REMOVED. One number (Automna Tokens)
> replaces both. `monthlyCallMinutes` stays as an additional guard rail for now (calls
> are expensive, separate cap prevents one runaway call from eating the whole budget).

### 3c. Create helper: `logUsageEvent()`

**New file:** `landing/src/app/api/_lib/usage-events.ts`

```typescript
import { db } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";

interface UsageEventInput {
  userId: string;
  eventType: 'llm' | 'search' | 'browser' | 'call' | 'email' | 'embedding';
  costMicrodollars: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

export function toAutomnaTokens(costMicrodollars: number): number {
  return Math.ceil(costMicrodollars / 100);
}

export async function logUsageEvent(input: UsageEventInput): Promise<void> {
  const automnaTokens = toAutomnaTokens(input.costMicrodollars);

  console.log(
    `[Usage] user=${input.userId} type=${input.eventType} ` +
    `tokens=${automnaTokens} cost=$${(input.costMicrodollars / 1_000_000).toFixed(4)}` +
    (input.error ? ` error=${input.error}` : "")
  );

  try {
    await db.insert(usageEvents).values({
      userId: input.userId,
      eventType: input.eventType,
      automnaTokens,
      costMicrodollars: input.costMicrodollars,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      error: input.error ?? null,
    });
  } catch (error) {
    console.error("[Usage] Failed to log event:", error);
  }
}

export function logUsageEventBackground(input: UsageEventInput): void {
  logUsageEvent(input).catch((error) => {
    console.error("[Usage] Background logging failed:", error);
  });
}
```

### 3d. Migrate table

Run against Turso:
```sql
CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  event_type TEXT NOT NULL,
  automna_tokens INTEGER NOT NULL DEFAULT 0,
  cost_microdollars INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  error TEXT
);

CREATE INDEX idx_usage_events_user_ts ON usage_events(user_id, timestamp);
CREATE INDEX idx_usage_events_type ON usage_events(event_type);
```

> **Keep `llm_usage` table for now.** Don't delete it — it has detailed per-field token
> breakdowns that are useful for debugging. But rate limiting and billing should read
> from `usage_events` going forward.

---

## 4. Phase 3: Update LLM Proxy Logging

**Goal:** LLM proxy writes to BOTH `llm_usage` (detailed) and `usage_events` (billing).

### 4a. Update `logUsageBackground()` calls

**File:** `landing/src/app/api/llm/v1/messages/route.ts`

After the existing `logUsageBackground()` call, add:

```typescript
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";
import { calculateCostMicrodollars } from "../_lib/pricing";

// ... existing token extraction code ...

// Log to usage_events for Automna Token billing
const costMicro = calculateCostMicrodollars(
  model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens
);
logUsageEventBackground({
  userId: auth.userId,
  eventType: 'llm',
  costMicrodollars: costMicro,
  metadata: {
    model,
    provider: 'anthropic',
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    requestId,
    durationMs: Date.now() - startTime,
  },
  error: errorMessage,
});
```

This goes in BOTH the non-streaming and streaming (flush) paths.

### 4b. Update Gemini proxy

**File:** `landing/src/app/api/gemini/[...path]/route.ts`

Add Gemini pricing to `pricing.ts`:
```typescript
// Gemini models
"gemini-2.5-flash-lite": { input: 0.10, output: 0.40, cacheCreation: 0, cacheRead: 0 },
"gemini-2.5-flash": { input: 0.30, output: 2.50, cacheCreation: 0, cacheRead: 0 },
"gemini-2.5-pro": { input: 1.25, output: 10.0, cacheCreation: 0, cacheRead: 0 },
"gemini-3-flash": { input: 0.50, output: 3.0, cacheCreation: 0, cacheRead: 0 },
"gemini-3-pro": { input: 2.0, output: 12.0, cacheCreation: 0, cacheRead: 0 },
```

After response parsing, add:
```typescript
const costMicro = inputTokens * pricing.input + outputTokens * pricing.output;
logUsageEventBackground({
  userId: auth.userId,
  eventType: 'embedding',  // or 'llm' if it's a generation call
  costMicrodollars: Math.round(costMicro),
  metadata: { model, inputTokens, outputTokens },
});
```

---

## 5. Phase 4: Add Logging to Non-LLM Proxies

**Goal:** Every billable proxy call logs to `usage_events`.

### 5a. Brave Search proxy

**File:** `landing/src/app/api/brave/[...path]/route.ts`

After successful response, add:
```typescript
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";

// Brave: $0.003/query = 3,000 microdollars
const BRAVE_COST_MICRODOLLARS = 3_000;

logUsageEventBackground({
  userId: auth.userId,
  eventType: 'search',
  costMicrodollars: BRAVE_COST_MICRODOLLARS,
  metadata: {
    endpoint,
    query: url.searchParams.get('q') || undefined,
    resultCount,
  },
  error: data.type === "ErrorResponse" ? data.message : undefined,
});
```

> **Only log on success.** Don't charge for failed/error requests.

### 5b. Browserbase proxy

**File:** `landing/src/app/api/browserbase/v1/[...path]/route.ts`

Browserbase is tricky — we need to track session duration, not just creation.

**Session creation:** Log a minimal event (0 cost) with the session ID.
```typescript
if (isSessionCreate && response.ok) {
  logUsageEventBackground({
    userId: auth.userId,
    eventType: 'browser',
    costMicrodollars: 0,  // Will be updated on session end
    metadata: {
      action: 'session_create',
      sessionId: responseData?.id,
    },
  });
}
```

**Session duration tracking:** This is harder. Options:
1. **Poll Browserbase API** for session duration after completion — complex
2. **Charge a flat per-session fee** (e.g., assume 5 min avg = 100 AT) — simple but imprecise
3. **Charge on session create with estimated duration** from `max_duration` if provided

**Recommended for now:** Charge a flat 200 Automna Tokens per session create (~10 min
equivalent, $0.02). Revisit when we have real session duration data.

```typescript
// Flat rate per browser session (estimated ~10 min average)
const BROWSER_SESSION_COST_MICRODOLLARS = 20_000;  // 200 AT

if (isSessionCreate && response.ok) {
  logUsageEventBackground({
    userId: auth.userId,
    eventType: 'browser',
    costMicrodollars: BROWSER_SESSION_COST_MICRODOLLARS,
    metadata: {
      sessionId: responseData?.id,
    },
  });
}
```

> **TODO:** Add Browserbase webhook or polling to get actual session duration and adjust.
> Track this as a future improvement.

### 5c. Email send

**File:** `landing/src/app/api/user/email/send/route.ts`

After successful Agentmail send:
```typescript
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";

// Email: ~$0.002/send = 2,000 microdollars
const EMAIL_SEND_COST_MICRODOLLARS = 2_000;

// After: const result = await agentmailResponse.json();
logUsageEventBackground({
  userId,
  eventType: 'email',
  costMicrodollars: EMAIL_SEND_COST_MICRODOLLARS,
  metadata: {
    recipient: Array.isArray(to) ? to[0] : to,
    subject,
    messageId: result.message_id,
  },
});
```

### 5d. Voice calls

**File:** `landing/src/app/api/webhooks/bland/status/route.ts`

On call completion webhook (where we already calculate cost):
```typescript
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";

// After calculating durationSeconds and costCents:
// Bland: $0.09/min connected = 90,000 microdollars/min
const callCostMicrodollars = Math.round((durationSeconds / 60) * 90_000);

// For failed calls: flat $0.015 = 15,000 microdollars
const finalCostMicro = durationSeconds > 0
  ? callCostMicrodollars
  : 15_000;  // failed attempt fee

logUsageEventBackground({
  userId: callRecord.userId,
  eventType: 'call',
  costMicrodollars: finalCostMicro,
  metadata: {
    blandCallId: callId,
    direction: callRecord.direction,
    toNumber: callRecord.toNumber,
    fromNumber: callRecord.fromNumber,
    durationSeconds,
    status: finalStatus,
  },
});
```

**Also update the call initiation endpoint** to check Automna Token budget (not just
call minutes) before allowing a call:

**File:** `landing/src/app/api/user/call/route.ts`

```typescript
import { getUsedAutomnaTokens } from "@/app/api/_lib/usage-events";

// After existing monthly minute check, also check token budget:
const usedTokens = await getUsedAutomnaTokens(userId);
const limits = PLAN_LIMITS[plan];
if (usedTokens >= limits.monthlyAutomnaTokens) {
  return NextResponse.json({
    error: "Monthly usage limit reached",
    used_tokens: usedTokens,
    limit_tokens: limits.monthlyAutomnaTokens,
  }, { status: 429 });
}
```

---

## 6. Phase 5: Update Rate Limiter

**Goal:** Rate limiter checks Automna Token budget instead of raw token sums.

**File:** `landing/src/app/api/llm/_lib/rate-limit.ts`

### 6a. Add helper to query monthly usage

Add to `usage-events.ts`:
```typescript
export async function getUsedAutomnaTokens(userId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(automna_tokens), 0)`.as('total'),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.timestamp, monthStartUnix)
      )
    );

  return Number(result[0]?.total || 0);
}

export async function getUsedAutomnaTokensByType(userId: string): Promise<Record<string, number>> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

  const result = await db
    .select({
      eventType: usageEvents.eventType,
      total: sql<number>`COALESCE(SUM(automna_tokens), 0)`.as('total'),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.timestamp, monthStartUnix)
      )
    )
    .groupBy(usageEvents.eventType);

  const byType: Record<string, number> = {};
  for (const row of result) {
    byType[row.eventType] = Number(row.total);
  }
  return byType;
}
```

### 6b. Update `checkRateLimits()`

Replace the monthly token/cost checks with a single Automna Token check:

```typescript
// REPLACE the monthly usage section with:
const usedAutomnaTokens = await getUsedAutomnaTokens(user.userId);

if (usedAutomnaTokens >= limits.monthlyAutomnaTokens) {
  return {
    allowed: false,
    reason: `Monthly token limit reached (${usedAutomnaTokens.toLocaleString()} / ${limits.monthlyAutomnaTokens.toLocaleString()})`,
    limits: {
      monthlyAutomnaTokens: { used: usedAutomnaTokens, limit: limits.monthlyAutomnaTokens },
      requestsPerMinute: { used: 0, limit: limits.requestsPerMinute },
    },
  };
}

// Keep per-minute rate limiting (RPM) as-is — that's a separate concern
```

### 6c. Update `RateLimitResult` interface

```typescript
export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  limits?: {
    monthlyAutomnaTokens: { used: number; limit: number };
    requestsPerMinute: { used: number; limit: number };
  };
  retryAfter?: number;
}
```

---

## 7. Phase 6: Update Usage API Endpoint

**Goal:** `/api/llm/usage` returns Automna Tokens instead of raw token counts.

**File:** `landing/src/app/api/llm/usage/route.ts`

### 7a. New response format

```typescript
return Response.json({
  plan,
  period: {
    start: monthStart.toISOString(),
    end: monthEnd.toISOString(),
  },
  usage: {
    automnaTokens: totalAutomnaTokens,      // THE number
    costMicrodollars: totalCostMicro,        // Internal, maybe hide later
  },
  limits: {
    monthlyAutomnaTokens: limits.monthlyAutomnaTokens,
    requestsPerMinute: limits.requestsPerMinute,
  },
  remaining: {
    automnaTokens: Math.max(0, limits.monthlyAutomnaTokens - totalAutomnaTokens),
  },
  percentUsed: Math.min(100, Math.round(
    (totalAutomnaTokens / limits.monthlyAutomnaTokens) * 100
  )),
  // Breakdown by activity type
  breakdown: {
    llm: byType.llm || 0,
    search: byType.search || 0,
    browser: byType.browser || 0,
    call: byType.call || 0,
    email: byType.email || 0,
    embedding: byType.embedding || 0,
  },
  // Daily breakdown for charts
  dailyBreakdown: dailyStats,
});
```

### 7b. Query from `usage_events` table

Replace the existing `llm_usage` queries with `usage_events` queries:

```typescript
const totalResult = await db
  .select({
    totalTokens: sql<number>`COALESCE(SUM(automna_tokens), 0)`,
    totalCost: sql<number>`COALESCE(SUM(cost_microdollars), 0)`,
  })
  .from(usageEvents)
  .where(
    and(
      eq(usageEvents.userId, userId),
      gte(usageEvents.timestamp, monthStartUnix)
    )
  );
```

---

## 8. Phase 7: Update Frontend

### 8a. Update `useUsageStatus` hook

**File:** `landing/src/hooks/useUsageStatus.ts`

```typescript
export interface UsageData {
  plan: string;
  usage: {
    automnaTokens: number;
  };
  limits: {
    monthlyAutomnaTokens: number;
  };
  percentUsed: number;  // Single number now (not tokens vs cost)
  breakdown: {
    llm: number;
    search: number;
    browser: number;
    call: number;
    email: number;
    embedding: number;
  };
}
```

Update `isOverLimit`:
```typescript
setIsOverLimit(data.percentUsed >= 100);
```

### 8b. Update `UsageBanner.tsx`

**File:** `landing/src/components/UsageBanner.tsx`

Replace token/cost display with Automna Tokens:

```typescript
const usedK = Math.round(usage.usage.automnaTokens / 1000);
const limitK = Math.round(usage.limits.monthlyAutomnaTokens / 1000);

// Format for display
const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
};

const messages = {
  info: `You've used ${formatTokens(usage.usage.automnaTokens)} of ${formatTokens(usage.limits.monthlyAutomnaTokens)} tokens on your ${planName} plan.`,
  warning: `You've used ${formatTokens(usage.usage.automnaTokens)} of ${formatTokens(usage.limits.monthlyAutomnaTokens)} tokens. Upgrade to keep chatting uninterrupted.`,
  limit: `You've reached your ${planName} plan token limit. Upgrade to continue using your agent.`,
};
```

Key change: `percentUsed` is now a single number (not max of tokens vs cost), and the
banner shows Automna Tokens, not raw API tokens.

### 8c. Update any other components that display usage

Check for references:
- `landing/src/app/admin/usage/page.tsx` — admin dashboard
- `landing/src/app/dashboard/page.tsx` — user dashboard

Update any `totalTokens`, `costCents`, `percentUsed.tokens`, `percentUsed.cost` references
to use the new `automnaTokens` / `percentUsed` fields.

---

## 9. Phase 8: Update Admin Dashboard

**File:** `landing/src/app/admin/usage/page.tsx`

The admin view should show BOTH Automna Tokens (user-facing) and real cost (internal):

```
User: grandathrawn@gmail.com
Plan: Pro (1M tokens)
Used: 45,000 AT (4.5%) | Real cost: $4.50
Breakdown: Chat 42,000 | Search 1,200 | Email 400 | Calls 1,400
```

**File:** `landing/src/app/api/admin/usage/route.ts`

Update to query `usage_events` and return both AT and real cost.

---

## 10. Phase 9: Update Pricing Page & Plan Limits

**File:** `landing/src/app/pricing/page.tsx`

Update displayed limits:
```
BEFORE:
- Starter: '500K tokens/month'
- Pro: '2M tokens/month'
- Business: '10M tokens/month'

AFTER:
- Starter: '200K tokens/month'
- Pro: '1M tokens/month'
- Business: '5M tokens/month'
```

> **⚠️ These numbers are DIFFERENT from before.** The old "500K tokens" meant raw API tokens.
> The new "200K tokens" means Automna Tokens (cost-weighted). Even though the number is
> smaller, users actually get MORE effective usage because the old system was wildly
> inflated by cache tokens.

---

## 11. Phase 10: Verification & Cleanup

### 11a. Verify all proxies log events

After deployment, make a test request through each proxy and confirm a `usage_events` row
is created with correct `automna_tokens`:

| Proxy | Test Action | Expected AT |
|-------|-------------|-------------|
| LLM (Sonnet) | Send "hello" | ~30-100 |
| LLM (Opus) | Send "hello" | ~40-150 |
| Brave | Search "test" | 30 |
| Browserbase | Create session | 200 |
| Email | Send test email | 20 |
| Gemini | Embedding request | 1 |
| Call | Make 1-min call | ~900 |

### 11b. Verify rate limiter

1. Check that a user at 100% Automna Token budget gets blocked on LLM requests
2. Check that the 429 response includes the new `monthlyAutomnaTokens` field
3. Check that per-minute RPM limits still work independently

### 11c. Verify frontend

1. UsageBanner shows "X of Y tokens" (Automna Tokens, not raw)
2. Progress bar percentage matches `percentUsed`
3. Admin dashboard shows both AT and real cost
4. Pricing page shows correct plan budgets

### 11d. Legacy cleanup (can defer)

- **`llm_usage` table**: Keep for now (detailed token breakdowns useful for debugging).
  Consider removing the `logUsageBackground()` calls from LLM proxy once `usage_events`
  is proven stable (reduce double-writes).
- **`PLAN_LIMITS` old fields**: Remove `monthlyTokens` and `monthlyCostCents` once all
  consumers are updated.
- **`llm_rate_limits` table**: Keep for per-minute RPM tracking (separate from monthly budget).

---

## 12. File-by-File Change List

| # | File | Change Type | Phase |
|---|------|-------------|-------|
| 1 | `landing/src/app/api/llm/_lib/pricing.ts` | Fix Opus 4.5 pricing, add Gemini pricing | 1 |
| 2 | `landing/src/lib/db/schema.ts` | Add `usage_events` table, update `PLAN_LIMITS` | 2 |
| 3 | `landing/src/app/api/_lib/usage-events.ts` | **NEW** — `logUsageEvent()`, `toAutomnaTokens()`, `getUsedAutomnaTokens()` | 2 |
| 4 | `landing/src/app/api/llm/v1/messages/route.ts` | Add `logUsageEventBackground()` call | 3 |
| 5 | `landing/src/app/api/gemini/[...path]/route.ts` | Add `logUsageEventBackground()` call | 3 |
| 6 | `landing/src/app/api/brave/[...path]/route.ts` | Add `logUsageEventBackground()` call | 4 |
| 7 | `landing/src/app/api/browserbase/v1/[...path]/route.ts` | Add `logUsageEventBackground()` call | 4 |
| 8 | `landing/src/app/api/user/email/send/route.ts` | Add `logUsageEventBackground()` call | 4 |
| 9 | `landing/src/app/api/webhooks/bland/status/route.ts` | Add `logUsageEventBackground()` call | 4 |
| 10 | `landing/src/app/api/user/call/route.ts` | Add AT budget check before allowing calls | 4 |
| 11 | `landing/src/app/api/llm/_lib/rate-limit.ts` | Switch from raw tokens to AT budget check | 5 |
| 12 | `landing/src/app/api/llm/usage/route.ts` | Return AT instead of raw tokens | 6 |
| 13 | `landing/src/hooks/useUsageStatus.ts` | Update `UsageData` interface | 7 |
| 14 | `landing/src/components/UsageBanner.tsx` | Display Automna Tokens | 7 |
| 15 | `landing/src/app/dashboard/page.tsx` | Update usage display | 7 |
| 16 | `landing/src/app/admin/usage/page.tsx` | Show AT + real cost | 8 |
| 17 | `landing/src/app/api/admin/usage/route.ts` | Query `usage_events` | 8 |
| 18 | `landing/src/app/pricing/page.tsx` | Update plan token numbers | 9 |

**Total: 18 files (1 new, 17 modified)**

---

## 13. Testing Checklist

### Pre-deployment
- [ ] `pricing.ts` has correct Opus 4.5 rates ($5/$25)
- [ ] `usage_events` table created in Turso
- [ ] `PLAN_LIMITS` updated with `monthlyAutomnaTokens`
- [ ] All 6 proxy routes have `logUsageEventBackground()` calls
- [ ] Rate limiter reads from `usage_events`
- [ ] Usage endpoint returns `automnaTokens` format
- [ ] Frontend components compile with new interfaces
- [ ] Pricing page shows new token numbers

### Post-deployment
- [ ] Send a chat message → `usage_events` row created with correct AT
- [ ] Run a web search → `usage_events` row with 30 AT
- [ ] Send an email → `usage_events` row with 20 AT
- [ ] Check `/api/llm/usage` returns new format
- [ ] UsageBanner displays correctly
- [ ] Admin dashboard shows per-user AT breakdown
- [ ] Rate limiter blocks at budget limit (test with low-limit plan)
- [ ] Old `llm_usage` still being written (dual-write)

---

## 14. Rollback Plan

If something goes wrong:

1. **Frontend only broken:** Revert Vercel deployment (instant via Vercel dashboard)
2. **Rate limiter too aggressive:** Temporarily multiply `monthlyAutomnaTokens` by 10x
   in PLAN_LIMITS
3. **Double-counting:** The `usage_events` table is NEW, so we can truncate it without
   affecting anything else. Old `llm_usage` table is untouched.
4. **Full rollback:** Revert to previous Vercel deployment. Rate limiter falls back to
   old `llm_usage` queries. Frontend shows old format. No data loss.

---

## Appendix: Cost Constants

Keep these in one place for easy updates:

```typescript
// landing/src/app/api/_lib/cost-constants.ts

// Service costs in microdollars
export const COSTS = {
  BRAVE_SEARCH_PER_QUERY: 3_000,          // $0.003
  BROWSERBASE_PER_SESSION: 20_000,         // $0.02 (flat estimate)
  EMAIL_SEND: 2_000,                       // $0.002
  CALL_PER_MINUTE: 90_000,                 // $0.09
  CALL_FAILED_ATTEMPT: 15_000,             // $0.015
  // LLM costs are computed dynamically from pricing.ts
} as const;

// Automna Token exchange rate
export const MICRODOLLARS_PER_AUTOMNA_TOKEN = 100;
```
