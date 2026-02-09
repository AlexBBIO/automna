/**
 * LLM Rate Limiting
 * 
 * Enforces per-minute RPM limits and monthly Automna Credit budgets.
 * Monthly budget reads from usage_events table (unified billing).
 */

import { db } from '@/lib/db';
import { llmRateLimits, PLAN_LIMITS } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { AuthenticatedUser } from './auth';
import { getUsedAutomnaCredits } from '@/app/api/_lib/usage-events';

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  limits?: {
    monthlyAutomnaCredits: { used: number; limit: number };
    requestsPerMinute: { used: number; limit: number };
  };
  retryAfter?: number; // seconds until rate limit resets
}

/**
 * Check if user is within rate limits
 */
export async function checkRateLimits(
  user: AuthenticatedUser,
): Promise<RateLimitResult> {
  const limits = PLAN_LIMITS[user.plan];
  const now = Math.floor(Date.now() / 1000);
  const currentMinute = Math.floor(now / 60);
  
  // 1. Check monthly Automna Credit budget
  const usedAutomnaCredits = await getUsedAutomnaCredits(user.userId);
  
  if (usedAutomnaCredits >= limits.monthlyAutomnaCredits) {
    return {
      allowed: false,
      reason: `Monthly credit limit reached (${usedAutomnaCredits.toLocaleString()} / ${limits.monthlyAutomnaCredits.toLocaleString()})`,
      limits: {
        monthlyAutomnaCredits: { used: usedAutomnaCredits, limit: limits.monthlyAutomnaCredits },
        requestsPerMinute: { used: 0, limit: limits.requestsPerMinute },
      },
    };
  }
  
  // 2. Check per-minute rate limit (RPM)
  let rateLimit = await db.query.llmRateLimits.findFirst({
    where: eq(llmRateLimits.userId, user.userId),
  });
  
  if (!rateLimit) {
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
        monthlyAutomnaCredits: { used: usedAutomnaCredits, limit: limits.monthlyAutomnaCredits },
        requestsPerMinute: { used: rateLimit.requestsThisMinute, limit: limits.requestsPerMinute },
      },
    };
  }
  
  // Increment request count (fire and forget)
  db.update(llmRateLimits)
    .set({
      requestsThisMinute: sql`requests_this_minute + 1`,
    })
    .where(eq(llmRateLimits.userId, user.userId))
    .catch(err => console.error('[rate-limit] Failed to increment:', err));
  
  return {
    allowed: true,
    limits: {
      monthlyAutomnaCredits: { used: usedAutomnaCredits, limit: limits.monthlyAutomnaCredits },
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
