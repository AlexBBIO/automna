/**
 * LLM Rate Limiting
 * 
 * Enforces per-minute and monthly usage limits based on user's plan.
 */

import { db } from '@/lib/db';
import { llmUsage, llmRateLimits, PLAN_LIMITS } from '@/lib/db/schema';
import { eq, sql, and, gte } from 'drizzle-orm';
import type { AuthenticatedUser } from './auth';
import { microToCents } from './pricing';

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  limits?: {
    monthlyTokens: { used: number; limit: number };
    monthlyCost: { used: number; limit: number }; // in cents
    requestsPerMinute: { used: number; limit: number };
  };
  retryAfter?: number; // seconds until rate limit resets
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
  const monthlyUsageResult = await db
    .select({
      totalTokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens), 0)`.as('total_tokens'),
      totalCost: sql<number>`COALESCE(SUM(cost_microdollars), 0)`.as('total_cost'),
    })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.userId, user.userId),
        gte(llmUsage.timestamp, monthStartUnix)
      )
    );
  
  const usedTokens = Number(monthlyUsageResult[0]?.totalTokens || 0);
  const usedCostMicro = Number(monthlyUsageResult[0]?.totalCost || 0);
  const usedCostCents = microToCents(usedCostMicro);
  
  // Check monthly token limit
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
  
  // Check monthly cost limit
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
    const [newRateLimit] = await db.insert(llmRateLimits).values({
      userId: user.userId,
      currentMinute,
      requestsThisMinute: 0,
      tokensThisMinute: 0,
      lastReset: now,
    }).returning();
    rateLimit = newRateLimit;
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
    
    rateLimit = {
      ...rateLimit,
      currentMinute,
      requestsThisMinute: 0,
      tokensThisMinute: 0,
    };
  }
  
  // Check requests per minute
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
  
  // Increment request count (don't await - fire and forget)
  db.update(llmRateLimits)
    .set({
      requestsThisMinute: sql`requests_this_minute + 1`,
    })
    .where(eq(llmRateLimits.userId, user.userId))
    .catch(err => console.error('[rate-limit] Failed to increment:', err));
  
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
 * Return 429 Rate Limited response (Anthropic error format)
 */
export function rateLimited(result: RateLimitResult) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  
  if (result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }
  
  return new Response(
    JSON.stringify({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: result.reason,
      },
      limits: result.limits,
    }),
    {
      status: 429,
      headers,
    }
  );
}
