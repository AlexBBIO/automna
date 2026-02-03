# LLM Proxy Implementation Plan

> **Goal:** Proxy all LLM API calls through Vercel to secure keys and enable usage tracking.
> 
> **Estimated Time:** 16-20 hours
> **Priority:** P0 (blocking launch)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [Implementation Steps](#implementation-steps)
5. [OpenClaw Integration](#openclaw-integration)
6. [Testing Plan](#testing-plan)
7. [Rollout Plan](#rollout-plan)

---

## Architecture Overview

### Current Flow (INSECURE)
```
┌──────────────────┐         ┌──────────────────┐
│  User's Fly App  │────────►│   Anthropic API  │
│                  │         │                  │
│ ANTHROPIC_API_KEY│         └──────────────────┘
│ (exposed to user)│
└──────────────────┘
```

### New Flow (SECURE)
```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  User's Fly App  │────────►│  Vercel Proxy    │────────►│   Anthropic API  │
│                  │         │                  │         │                  │
│ GATEWAY_TOKEN    │         │ /api/llm/chat    │         └──────────────────┘
│ (identifies user)│         │                  │         ┌──────────────────┐
│                  │         │ • Authenticate   │────────►│   Gemini API     │
│ NO API KEYS      │         │ • Check limits   │         │   (embeddings)   │
└──────────────────┘         │ • Log usage      │         └──────────────────┘
                             │ • Add API key    │
                             │ • Stream back    │
                             │                  │
                             └────────┬─────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │    Turso DB      │
                             │                  │
                             │ • llm_usage      │
                             │ • llm_rate_limits│
                             └──────────────────┘
```

---

## Database Schema

### File: `landing/src/lib/db/schema.ts`

Add these tables to the existing schema:

```typescript
// ============================================
// LLM USAGE TRACKING
// ============================================

export const llmUsage = sqliteTable('llm_usage', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  timestamp: integer('timestamp').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  
  // Request details
  provider: text('provider').notNull(), // 'anthropic' | 'gemini' | 'openai'
  model: text('model').notNull(),       // 'claude-opus-4-5' | 'claude-sonnet-4' | etc.
  endpoint: text('endpoint').notNull(), // 'chat' | 'embed'
  
  // Token counts
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  
  // Cost in microdollars (1 USD = 1,000,000 microdollars)
  // Using microdollars for precision without floating point
  costMicrodollars: integer('cost_microdollars').notNull().default(0),
  
  // Request metadata
  sessionKey: text('session_key'),      // Which conversation
  requestId: text('request_id'),        // For debugging
  durationMs: integer('duration_ms'),   // How long the request took
  
  // Error tracking
  error: text('error'),                 // Error message if failed
  
  // Foreign key
}, (table) => ({
  userTimestampIdx: index('idx_llm_usage_user_timestamp').on(table.userId, table.timestamp),
  userMonthIdx: index('idx_llm_usage_user_month').on(table.userId),
}));

export const llmRateLimits = sqliteTable('llm_rate_limits', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().unique(),
  
  // Current minute tracking (for RPM limits)
  currentMinute: integer('current_minute').notNull().default(0),
  requestsThisMinute: integer('requests_this_minute').notNull().default(0),
  tokensThisMinute: integer('tokens_this_minute').notNull().default(0),
  
  // Last reset timestamp
  lastReset: integer('last_reset').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// Plan limits stored in code (not DB) for simplicity
export const PLAN_LIMITS = {
  free: {
    monthlyTokens: 100_000,        // 100K tokens
    monthlyCostCents: 100,         // $1 cap
    requestsPerMinute: 5,
    tokensPerMinute: 10_000,
  },
  starter: {
    monthlyTokens: 2_000_000,      // 2M tokens
    monthlyCostCents: 2000,        // $20 cap
    requestsPerMinute: 20,
    tokensPerMinute: 50_000,
  },
  pro: {
    monthlyTokens: 10_000_000,     // 10M tokens
    monthlyCostCents: 10000,       // $100 cap
    requestsPerMinute: 60,
    tokensPerMinute: 150_000,
  },
  business: {
    monthlyTokens: 50_000_000,     // 50M tokens
    monthlyCostCents: 50000,       // $500 cap
    requestsPerMinute: 120,
    tokensPerMinute: 300_000,
  },
} as const;
```

### Migration SQL

```sql
-- Run via Turso CLI or Drizzle migration

CREATE TABLE IF NOT EXISTS llm_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_microdollars INTEGER NOT NULL DEFAULT 0,
  
  session_key TEXT,
  request_id TEXT,
  duration_ms INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_user_timestamp ON llm_usage(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_llm_usage_user_month ON llm_usage(user_id, timestamp / 2592000);

CREATE TABLE IF NOT EXISTS llm_rate_limits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  current_minute INTEGER NOT NULL DEFAULT 0,
  requests_this_minute INTEGER NOT NULL DEFAULT 0,
  tokens_this_minute INTEGER NOT NULL DEFAULT 0,
  last_reset INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

## API Endpoints

### Directory Structure

```
landing/src/app/api/llm/
├── chat/
│   └── route.ts          # POST - Anthropic chat completions proxy
├── embed/
│   └── route.ts          # POST - Gemini embeddings proxy
├── usage/
│   └── route.ts          # GET - User's usage stats
└── _lib/
    ├── auth.ts           # Gateway token authentication
    ├── rate-limit.ts     # Rate limiting logic
    ├── usage.ts          # Usage tracking/logging
    ├── pricing.ts        # Token cost calculation
    └── stream.ts         # SSE stream handling
```

---

## Implementation Steps

### Step 1: Authentication Helper (1 hour)

**File: `landing/src/app/api/llm/_lib/auth.ts`**

```typescript
import { db } from '@/lib/db';
import { machines } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface AuthenticatedUser {
  userId: string;
  machineId: string;
  appName: string;
  plan: 'free' | 'starter' | 'pro' | 'business';
}

/**
 * Authenticate a request using gateway token.
 * Returns user info or null if invalid.
 */
export async function authenticateGatewayToken(
  request: Request
): Promise<AuthenticatedUser | null> {
  // Extract token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.slice(7);
  if (!token) {
    return null;
  }
  
  // Look up machine by gateway token
  const machine = await db.query.machines.findFirst({
    where: eq(machines.gatewayToken, token),
  });
  
  if (!machine) {
    return null;
  }
  
  // Get user's plan from Clerk metadata (cached in our DB or fetched)
  // For now, default to 'starter' - we'll wire up Clerk later
  const plan = machine.plan || 'starter';
  
  return {
    userId: machine.userId,
    machineId: machine.id,
    appName: machine.appName || '',
    plan: plan as AuthenticatedUser['plan'],
  };
}

/**
 * Return 401 Unauthorized response
 */
export function unauthorized(message = 'Unauthorized') {
  return Response.json(
    { error: { type: 'authentication_error', message } },
    { status: 401 }
  );
}
```

---

### Step 2: Pricing Calculator (30 min)

**File: `landing/src/app/api/llm/_lib/pricing.ts`**

```typescript
/**
 * Anthropic pricing as of Jan 2026 (per million tokens)
 * Prices in microdollars (1 USD = 1,000,000)
 */
export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  // Opus 4.5
  'claude-opus-4-5': { input: 15_000_000, output: 75_000_000 },
  'claude-opus-4-5-20250929': { input: 15_000_000, output: 75_000_000 },
  'anthropic/claude-opus-4-5': { input: 15_000_000, output: 75_000_000 },
  
  // Sonnet 4
  'claude-sonnet-4': { input: 3_000_000, output: 15_000_000 },
  'claude-sonnet-4-20250514': { input: 3_000_000, output: 15_000_000 },
  'anthropic/claude-sonnet-4': { input: 3_000_000, output: 15_000_000 },
  
  // Haiku
  'claude-3-5-haiku': { input: 250_000, output: 1_250_000 },
  'claude-3-5-haiku-latest': { input: 250_000, output: 1_250_000 },
  'claude-3-5-haiku-20241022': { input: 250_000, output: 1_250_000 },
  
  // Default fallback (Sonnet pricing)
  'default': { input: 3_000_000, output: 15_000_000 },
};

/**
 * Gemini pricing (embeddings)
 */
export const GEMINI_PRICING: Record<string, { input: number }> = {
  'gemini-embedding-001': { input: 10_000 }, // $0.00001 per 1K tokens
  'text-embedding-004': { input: 10_000 },
  'default': { input: 10_000 },
};

/**
 * Calculate cost in microdollars
 */
export function calculateCost(
  provider: 'anthropic' | 'gemini',
  model: string,
  inputTokens: number,
  outputTokens: number = 0
): number {
  if (provider === 'anthropic') {
    const pricing = ANTHROPIC_PRICING[model] || ANTHROPIC_PRICING['default'];
    const inputCost = Math.ceil((inputTokens / 1_000_000) * pricing.input);
    const outputCost = Math.ceil((outputTokens / 1_000_000) * pricing.output);
    return inputCost + outputCost;
  }
  
  if (provider === 'gemini') {
    const pricing = GEMINI_PRICING[model] || GEMINI_PRICING['default'];
    return Math.ceil((inputTokens / 1_000_000) * pricing.input);
  }
  
  return 0;
}

/**
 * Format microdollars as human-readable USD
 */
export function formatCost(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  return `$${dollars.toFixed(4)}`;
}
```

---

### Step 3: Rate Limiting (2 hours)

**File: `landing/src/app/api/llm/_lib/rate-limit.ts`**

```typescript
import { db } from '@/lib/db';
import { llmUsage, llmRateLimits, PLAN_LIMITS } from '@/lib/db/schema';
import { eq, sql, and, gte } from 'drizzle-orm';
import type { AuthenticatedUser } from './auth';

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  limits?: {
    monthlyTokens: { used: number; limit: number };
    monthlyCost: { used: number; limit: number };
    requestsPerMinute: { used: number; limit: number };
  };
  retryAfter?: number; // seconds
}

/**
 * Check if user is within rate limits
 */
export async function checkRateLimits(
  user: AuthenticatedUser,
  estimatedTokens: number = 0
): Promise<RateLimitResult> {
  const limits = PLAN_LIMITS[user.plan];
  const now = Math.floor(Date.now() / 1000);
  const currentMinute = Math.floor(now / 60);
  
  // Get start of current month (UTC)
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
  
  // 1. Check monthly usage
  const monthlyUsage = await db
    .select({
      totalTokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens), 0)`,
      totalCost: sql<number>`COALESCE(SUM(cost_microdollars), 0)`,
    })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.userId, user.userId),
        gte(llmUsage.timestamp, monthStartUnix)
      )
    );
  
  const usedTokens = monthlyUsage[0]?.totalTokens || 0;
  const usedCostMicro = monthlyUsage[0]?.totalCost || 0;
  const usedCostCents = Math.floor(usedCostMicro / 10_000); // microdollars to cents
  
  if (usedTokens + estimatedTokens > limits.monthlyTokens) {
    return {
      allowed: false,
      reason: `Monthly token limit exceeded (${usedTokens.toLocaleString()}/${limits.monthlyTokens.toLocaleString()})`,
      limits: {
        monthlyTokens: { used: usedTokens, limit: limits.monthlyTokens },
        monthlyCost: { used: usedCostCents, limit: limits.monthlyCostCents },
        requestsPerMinute: { used: 0, limit: limits.requestsPerMinute },
      },
    };
  }
  
  if (usedCostCents >= limits.monthlyCostCents) {
    return {
      allowed: false,
      reason: `Monthly cost limit exceeded ($${(usedCostCents / 100).toFixed(2)}/$${(limits.monthlyCostCents / 100).toFixed(2)})`,
      limits: {
        monthlyTokens: { used: usedTokens, limit: limits.monthlyTokens },
        monthlyCost: { used: usedCostCents, limit: limits.monthlyCostCents },
        requestsPerMinute: { used: 0, limit: limits.requestsPerMinute },
      },
    };
  }
  
  // 2. Check per-minute rate limit
  let rateLimit = await db.query.llmRateLimits.findFirst({
    where: eq(llmRateLimits.userId, user.userId),
  });
  
  if (!rateLimit) {
    // Create rate limit record
    await db.insert(llmRateLimits).values({
      userId: user.userId,
      currentMinute,
      requestsThisMinute: 0,
      tokensThisMinute: 0,
      lastReset: now,
    });
    rateLimit = {
      id: '',
      userId: user.userId,
      currentMinute,
      requestsThisMinute: 0,
      tokensThisMinute: 0,
      lastReset: now,
    };
  }
  
  // Reset if we're in a new minute
  if (rateLimit.currentMinute !== currentMinute) {
    await db
      .update(llmRateLimits)
      .set({
        currentMinute,
        requestsThisMinute: 0,
        tokensThisMinute: 0,
        lastReset: now,
      })
      .where(eq(llmRateLimits.userId, user.userId));
    
    rateLimit.requestsThisMinute = 0;
    rateLimit.tokensThisMinute = 0;
  }
  
  if (rateLimit.requestsThisMinute >= limits.requestsPerMinute) {
    const secondsUntilReset = 60 - (now % 60);
    return {
      allowed: false,
      reason: `Rate limit exceeded (${rateLimit.requestsThisMinute}/${limits.requestsPerMinute} requests/min)`,
      retryAfter: secondsUntilReset,
      limits: {
        monthlyTokens: { used: usedTokens, limit: limits.monthlyTokens },
        monthlyCost: { used: usedCostCents, limit: limits.monthlyCostCents },
        requestsPerMinute: { used: rateLimit.requestsThisMinute, limit: limits.requestsPerMinute },
      },
    };
  }
  
  // Increment request count
  await db
    .update(llmRateLimits)
    .set({
      requestsThisMinute: sql`requests_this_minute + 1`,
    })
    .where(eq(llmRateLimits.userId, user.userId));
  
  return {
    allowed: true,
    limits: {
      monthlyTokens: { used: usedTokens, limit: limits.monthlyTokens },
      monthlyCost: { used: usedCostCents, limit: limits.monthlyCostCents },
      requestsPerMinute: { used: rateLimit.requestsThisMinute + 1, limit: limits.requestsPerMinute },
    },
  };
}

/**
 * Return 429 Rate Limited response
 */
export function rateLimited(result: RateLimitResult) {
  return Response.json(
    {
      error: {
        type: 'rate_limit_error',
        message: result.reason,
        limits: result.limits,
      },
    },
    {
      status: 429,
      headers: result.retryAfter
        ? { 'Retry-After': result.retryAfter.toString() }
        : {},
    }
  );
}
```

---

### Step 4: Usage Logging (1 hour)

**File: `landing/src/app/api/llm/_lib/usage.ts`**

```typescript
import { db } from '@/lib/db';
import { llmUsage } from '@/lib/db/schema';
import { calculateCost } from './pricing';

export interface UsageLogParams {
  userId: string;
  provider: 'anthropic' | 'gemini';
  model: string;
  endpoint: 'chat' | 'embed';
  inputTokens: number;
  outputTokens?: number;
  sessionKey?: string;
  requestId?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Log LLM usage to database.
 * This is non-blocking - we don't await the result.
 */
export function logUsage(params: UsageLogParams): void {
  const {
    userId,
    provider,
    model,
    endpoint,
    inputTokens,
    outputTokens = 0,
    sessionKey,
    requestId,
    durationMs,
    error,
  } = params;
  
  const costMicrodollars = calculateCost(provider, model, inputTokens, outputTokens);
  
  // Fire and forget - don't block the response
  db.insert(llmUsage)
    .values({
      userId,
      provider,
      model,
      endpoint,
      inputTokens,
      outputTokens,
      costMicrodollars,
      sessionKey,
      requestId,
      durationMs,
      error,
    })
    .catch((err) => {
      console.error('[llm/usage] Failed to log usage:', err);
    });
}

/**
 * Log usage and wait for it to complete (for testing)
 */
export async function logUsageSync(params: UsageLogParams): Promise<void> {
  const costMicrodollars = calculateCost(
    params.provider,
    params.model,
    params.inputTokens,
    params.outputTokens || 0
  );
  
  await db.insert(llmUsage).values({
    ...params,
    outputTokens: params.outputTokens || 0,
    costMicrodollars,
  });
}
```

---

### Step 5: SSE Stream Handler (2 hours)

**File: `landing/src/app/api/llm/_lib/stream.ts`**

```typescript
/**
 * Parse Anthropic SSE stream and extract token counts.
 * 
 * Anthropic SSE format:
 *   event: message_start
 *   data: {"type":"message_start","message":{"usage":{"input_tokens":25}}}
 *   
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","delta":{"text":"Hello"}}
 *   
 *   event: message_delta  
 *   data: {"type":"message_delta","usage":{"output_tokens":15}}
 */

export interface StreamTokens {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Create a transform stream that passes through data while counting tokens.
 */
export function createTokenCountingStream(
  onComplete: (tokens: StreamTokens) => void
): TransformStream<Uint8Array, Uint8Array> {
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = '';
  
  return new TransformStream({
    transform(chunk, controller) {
      // Pass through the chunk unchanged
      controller.enqueue(chunk);
      
      // Decode and parse for token counts
      const text = new TextDecoder().decode(chunk);
      buffer += text;
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        const jsonStr = line.slice(6); // Remove 'data: ' prefix
        if (jsonStr === '[DONE]') continue;
        
        try {
          const data = JSON.parse(jsonStr);
          
          // Extract input tokens from message_start
          if (data.type === 'message_start' && data.message?.usage?.input_tokens) {
            inputTokens = data.message.usage.input_tokens;
          }
          
          // Extract output tokens from message_delta
          if (data.type === 'message_delta' && data.usage?.output_tokens) {
            outputTokens = data.usage.output_tokens;
          }
        } catch {
          // Ignore parse errors
        }
      }
    },
    
    flush() {
      // Process any remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          if (data.type === 'message_delta' && data.usage?.output_tokens) {
            outputTokens = data.usage.output_tokens;
          }
        } catch {
          // Ignore
        }
      }
      
      // Call completion handler with final counts
      onComplete({ inputTokens, outputTokens });
    },
  });
}

/**
 * Parse a non-streaming Anthropic response for token counts.
 */
export function extractTokensFromResponse(data: any): StreamTokens {
  return {
    inputTokens: data?.usage?.input_tokens || 0,
    outputTokens: data?.usage?.output_tokens || 0,
  };
}
```

---

### Step 6: Chat Proxy Endpoint (3 hours)

**File: `landing/src/app/api/llm/chat/route.ts`**

```typescript
import { authenticateGatewayToken, unauthorized } from '../_lib/auth';
import { checkRateLimits, rateLimited } from '../_lib/rate-limit';
import { logUsage } from '../_lib/usage';
import { createTokenCountingStream, extractTokensFromResponse } from '../_lib/stream';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export const runtime = 'edge'; // Use Edge Runtime for better streaming

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // 1. Authenticate
  const user = await authenticateGatewayToken(request);
  if (!user) {
    return unauthorized('Invalid or missing gateway token');
  }
  
  // 2. Parse request body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { type: 'invalid_request_error', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }
  
  const { model, messages, stream = false, ...rest } = body;
  
  if (!model || !messages) {
    return Response.json(
      { error: { type: 'invalid_request_error', message: 'Missing model or messages' } },
      { status: 400 }
    );
  }
  
  // 3. Check rate limits
  // Estimate input tokens (rough: 4 chars per token)
  const estimatedInputTokens = JSON.stringify(messages).length / 4;
  const rateLimitResult = await checkRateLimits(user, estimatedInputTokens);
  
  if (!rateLimitResult.allowed) {
    return rateLimited(rateLimitResult);
  }
  
  // 4. Forward to Anthropic
  const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream,
      ...rest,
    }),
  });
  
  // 5. Handle errors from Anthropic
  if (!anthropicResponse.ok) {
    const error = await anthropicResponse.text();
    console.error(`[llm/chat] Anthropic error: ${anthropicResponse.status}`, error);
    
    logUsage({
      userId: user.userId,
      provider: 'anthropic',
      model,
      endpoint: 'chat',
      inputTokens: 0,
      outputTokens: 0,
      requestId,
      durationMs: Date.now() - startTime,
      error: `Anthropic ${anthropicResponse.status}: ${error.slice(0, 200)}`,
    });
    
    return new Response(error, {
      status: anthropicResponse.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  
  // 6. Handle streaming response
  if (stream) {
    const tokenCountingStream = createTokenCountingStream((tokens) => {
      logUsage({
        userId: user.userId,
        provider: 'anthropic',
        model,
        endpoint: 'chat',
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        requestId,
        durationMs: Date.now() - startTime,
      });
    });
    
    const transformedStream = anthropicResponse.body!.pipeThrough(tokenCountingStream);
    
    return new Response(transformedStream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      },
    });
  }
  
  // 7. Handle non-streaming response
  const data = await anthropicResponse.json();
  const tokens = extractTokensFromResponse(data);
  
  logUsage({
    userId: user.userId,
    provider: 'anthropic',
    model,
    endpoint: 'chat',
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    requestId,
    durationMs: Date.now() - startTime,
  });
  
  return Response.json(data);
}
```

---

### Step 7: Embeddings Proxy Endpoint (1 hour)

**File: `landing/src/app/api/llm/embed/route.ts`**

```typescript
import { authenticateGatewayToken, unauthorized } from '../_lib/auth';
import { checkRateLimits, rateLimited } from '../_lib/rate-limit';
import { logUsage } from '../_lib/usage';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const runtime = 'edge';

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // 1. Authenticate
  const user = await authenticateGatewayToken(request);
  if (!user) {
    return unauthorized('Invalid or missing gateway token');
  }
  
  // 2. Parse request
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { type: 'invalid_request_error', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }
  
  const { model = 'text-embedding-004', content } = body;
  
  if (!content) {
    return Response.json(
      { error: { type: 'invalid_request_error', message: 'Missing content' } },
      { status: 400 }
    );
  }
  
  // 3. Check rate limits
  const estimatedTokens = content.length / 4;
  const rateLimitResult = await checkRateLimits(user, estimatedTokens);
  
  if (!rateLimitResult.allowed) {
    return rateLimited(rateLimitResult);
  }
  
  // 4. Forward to Gemini
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${GEMINI_API_KEY}`;
  
  const geminiResponse = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: content }] },
    }),
  });
  
  if (!geminiResponse.ok) {
    const error = await geminiResponse.text();
    console.error(`[llm/embed] Gemini error: ${geminiResponse.status}`, error);
    
    logUsage({
      userId: user.userId,
      provider: 'gemini',
      model,
      endpoint: 'embed',
      inputTokens: 0,
      requestId,
      durationMs: Date.now() - startTime,
      error: `Gemini ${geminiResponse.status}: ${error.slice(0, 200)}`,
    });
    
    return new Response(error, { status: geminiResponse.status });
  }
  
  const data = await geminiResponse.json();
  
  // Estimate tokens (Gemini doesn't return token count for embeddings)
  const inputTokens = Math.ceil(content.length / 4);
  
  logUsage({
    userId: user.userId,
    provider: 'gemini',
    model,
    endpoint: 'embed',
    inputTokens,
    requestId,
    durationMs: Date.now() - startTime,
  });
  
  return Response.json(data);
}
```

---

### Step 8: Usage Stats Endpoint (1 hour)

**File: `landing/src/app/api/llm/usage/route.ts`**

```typescript
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { llmUsage, machines, PLAN_LIMITS } from '@/lib/db/schema';
import { eq, sql, and, gte } from 'drizzle-orm';
import { formatCost } from '../_lib/pricing';

export async function GET() {
  // Auth via Clerk (dashboard) or gateway token (agent)
  const { userId } = await auth();
  
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Get user's plan
  const machine = await db.query.machines.findFirst({
    where: eq(machines.userId, userId),
  });
  
  const plan = (machine?.plan || 'starter') as keyof typeof PLAN_LIMITS;
  const limits = PLAN_LIMITS[plan];
  
  // Get start of current month
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
  
  // Get monthly totals
  const monthlyStats = await db
    .select({
      totalRequests: sql<number>`COUNT(*)`,
      totalInputTokens: sql<number>`COALESCE(SUM(input_tokens), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(output_tokens), 0)`,
      totalCostMicro: sql<number>`COALESCE(SUM(cost_microdollars), 0)`,
    })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.userId, userId),
        gte(llmUsage.timestamp, monthStartUnix)
      )
    );
  
  const stats = monthlyStats[0];
  const totalTokens = (stats?.totalInputTokens || 0) + (stats?.totalOutputTokens || 0);
  const totalCostCents = Math.floor((stats?.totalCostMicro || 0) / 10_000);
  
  // Get daily breakdown (last 30 days)
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  
  const dailyStats = await db
    .select({
      day: sql<number>`date(timestamp, 'unixepoch')`,
      requests: sql<number>`COUNT(*)`,
      tokens: sql<number>`SUM(input_tokens + output_tokens)`,
      cost: sql<number>`SUM(cost_microdollars)`,
    })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.userId, userId),
        gte(llmUsage.timestamp, thirtyDaysAgo)
      )
    )
    .groupBy(sql`date(timestamp, 'unixepoch')`)
    .orderBy(sql`date(timestamp, 'unixepoch') DESC`)
    .limit(30);
  
  return Response.json({
    plan,
    period: {
      start: monthStart.toISOString(),
      end: new Date(monthStart.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString(),
    },
    usage: {
      requests: stats?.totalRequests || 0,
      inputTokens: stats?.totalInputTokens || 0,
      outputTokens: stats?.totalOutputTokens || 0,
      totalTokens,
      cost: formatCost(stats?.totalCostMicro || 0),
      costCents: totalCostCents,
    },
    limits: {
      monthlyTokens: limits.monthlyTokens,
      monthlyCostCents: limits.monthlyCostCents,
      requestsPerMinute: limits.requestsPerMinute,
    },
    remaining: {
      tokens: Math.max(0, limits.monthlyTokens - totalTokens),
      costCents: Math.max(0, limits.monthlyCostCents - totalCostCents),
    },
    percentUsed: {
      tokens: Math.min(100, Math.round((totalTokens / limits.monthlyTokens) * 100)),
      cost: Math.min(100, Math.round((totalCostCents / limits.monthlyCostCents) * 100)),
    },
    dailyBreakdown: dailyStats.map((d) => ({
      date: d.day,
      requests: d.requests,
      tokens: d.tokens,
      cost: formatCost(d.cost || 0),
    })),
  });
}
```

---

## OpenClaw Integration

### Step 9: Test ANTHROPIC_BASE_URL (1 hour)

First, test if OpenClaw respects the `ANTHROPIC_BASE_URL` environment variable.

**Test script:**
```bash
# On a test Fly machine
export ANTHROPIC_BASE_URL=https://automna.ai/api/llm/chat
export ANTHROPIC_API_KEY=<gateway_token>

# Try a simple request through OpenClaw
openclaw chat "Say hello"
```

If this works, we can simply set these env vars in the Docker image.

### Step 10: Update Docker Config (2 hours)

**File: `docker/entrypoint.sh`**

Add to the environment setup:

```bash
# LLM Proxy Configuration
# Point OpenClaw at our proxy instead of direct Anthropic
export ANTHROPIC_BASE_URL="https://automna.ai/api/llm/chat"
# Use gateway token as the "API key" - our proxy validates this
export ANTHROPIC_API_KEY="$OPENCLAW_GATEWAY_TOKEN"

# Same for Gemini embeddings
export GEMINI_API_BASE_URL="https://automna.ai/api/llm/embed"
export GEMINI_API_KEY="$OPENCLAW_GATEWAY_TOKEN"

# Clear the real API keys from environment (security)
# They're now only in Vercel, not on user machines
```

**File: `docker/clawdbot.json`**

Update config if needed:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4-5"
      },
      "memorySearch": {
        "enabled": true,
        "provider": "gemini",
        "model": "text-embedding-004"
      }
    }
  }
}
```

### Step 11: Update Provisioning (1 hour)

**File: `landing/src/app/api/user/provision/route.ts`**

Remove direct API keys from machine environment:

```typescript
// OLD (insecure):
const env: Record<string, string> = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  // ...
};

// NEW (secure):
const env: Record<string, string> = {
  // No API keys - they stay in Vercel
  OPENCLAW_GATEWAY_TOKEN: gatewayToken,
  ANTHROPIC_BASE_URL: "https://automna.ai/api/llm/chat",
  ANTHROPIC_API_KEY: gatewayToken, // Gateway token acts as "API key"
  GEMINI_API_BASE_URL: "https://automna.ai/api/llm/embed",
  GEMINI_API_KEY: gatewayToken,
  // ...
};
```

---

## Testing Plan

### Unit Tests

**File: `landing/src/__tests__/api/llm-proxy.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateCost } from '../app/api/llm/_lib/pricing';

describe('LLM Proxy', () => {
  describe('Pricing', () => {
    it('calculates Opus cost correctly', () => {
      // $15 input + $75 output per million
      const cost = calculateCost('anthropic', 'claude-opus-4-5', 1000, 500);
      // 1000 input = $0.015, 500 output = $0.0375, total = $0.0525
      expect(cost).toBe(52_500); // microdollars
    });

    it('calculates Sonnet cost correctly', () => {
      const cost = calculateCost('anthropic', 'claude-sonnet-4', 10000, 5000);
      // 10000 input = $0.03, 5000 output = $0.075, total = $0.105
      expect(cost).toBe(105_000);
    });

    it('calculates Gemini embedding cost', () => {
      const cost = calculateCost('gemini', 'text-embedding-004', 1000, 0);
      // $0.00001 per token = $0.01 for 1000
      expect(cost).toBe(10_000);
    });
  });

  describe('Stream parsing', () => {
    // Test token extraction from SSE stream
  });

  describe('Rate limiting', () => {
    // Test monthly limits
    // Test per-minute limits
    // Test limit reset
  });
});
```

### Integration Tests

1. **Auth test:** Invalid token returns 401
2. **Rate limit test:** Exceeding limits returns 429
3. **Streaming test:** Stream passes through correctly
4. **Usage logging test:** Requests are logged to DB
5. **End-to-end test:** Full flow from OpenClaw → Proxy → Anthropic

### Manual Testing Checklist

- [ ] Send chat request through proxy
- [ ] Verify streaming works
- [ ] Verify token counts are accurate
- [ ] Verify usage is logged to DB
- [ ] Verify rate limits work
- [ ] Verify monthly limits work
- [ ] Test with real OpenClaw instance
- [ ] Test error handling (invalid model, Anthropic errors)

---

## Rollout Plan

### Phase 1: Build & Test (Day 1-2)

1. Create database tables
2. Implement all API endpoints
3. Write tests
4. Test manually with curl

### Phase 2: OpenClaw Integration (Day 2)

1. Test ANTHROPIC_BASE_URL approach
2. Update Docker image
3. Test with real agent

### Phase 3: Staging Rollout (Day 3)

1. Deploy to Vercel (staging)
2. Create test user with new config
3. Verify full flow works
4. Monitor for errors

### Phase 4: Production Rollout (Day 3-4)

1. Deploy to production
2. Update existing user machines (rolling update)
3. Monitor usage/errors
4. Remove old direct API key code

### Rollback Plan

If issues arise:
1. Revert Docker image to direct API key version
2. Proxy endpoints remain but unused
3. Fix issues, try again

---

## Success Metrics

- [ ] No API keys exposed to users
- [ ] 99.9% proxy uptime
- [ ] < 100ms latency overhead
- [ ] Usage tracking accurate within 5%
- [ ] Rate limiting prevents abuse
- [ ] Dashboard shows usage stats

---

## Future Enhancements

1. **Cost alerts:** Email when approaching limits
2. **Usage dashboard:** Charts in dashboard UI
3. **Model routing:** Route to cheaper models when near limit
4. **Caching:** Cache common embeddings
5. **Analytics:** Track popular models, peak times
6. **Burst handling:** Allow temporary limit overages
