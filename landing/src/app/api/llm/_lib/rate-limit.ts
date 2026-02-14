/**
 * LLM Rate Limiting
 * 
 * Enforces per-minute RPM limits and monthly Automna Credit budgets.
 * Monthly budget reads from usage_events table (unified billing).
 */

import { db } from '@/lib/db';
import { llmRateLimits, creditBalances, LEGACY_PLAN_LIMITS, PLAN_LIMITS } from '@/lib/db/schema';
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
  // Determine effective plan (respect downgrade grace period)
  let effectivePlan = user.plan;
  const now = Math.floor(Date.now() / 1000);
  if (user.effectivePlan && user.effectivePlanUntil && user.effectivePlanUntil > now) {
    effectivePlan = user.effectivePlan as typeof user.plan;
  }

  const legacyLimits = LEGACY_PLAN_LIMITS[effectivePlan as keyof typeof LEGACY_PLAN_LIMITS] 
    || LEGACY_PLAN_LIMITS[user.plan as keyof typeof LEGACY_PLAN_LIMITS];
  
  // BYOK users (own credentials) get small service credit allowances from new PLAN_LIMITS
  // Legacy users (no byokProvider) keep their existing generous allowances
  const isByok = user.byokProvider === 'anthropic_oauth' || user.byokProvider === 'anthropic_api_key';
  const byokPlanLimits = PLAN_LIMITS[effectivePlan as keyof typeof PLAN_LIMITS]
    || PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS];
  const monthlyCreditsLimit = isByok && byokPlanLimits
    ? byokPlanLimits.monthlyServiceCredits
    : legacyLimits.monthlyAutomnaCredits;
  const rpmLimit = legacyLimits.requestsPerMinute; // RPM same for all
  
  const currentMinute = Math.floor(now / 60);
  
  // 1. Check credit budget
  const isProxy = user.byokProvider === 'proxy';
  let usedAutomnaCredits = 0;
  
  if (isProxy) {
    // Proxy users: check prepaid credit balance (hard block at $0)
    const bal = await db.query.creditBalances.findFirst({
      where: eq(creditBalances.userId, user.userId),
    });
    const creditBalance = bal?.balance ?? 0;
    
    if (creditBalance <= 0) {
      return {
        allowed: false,
        reason: 'No credits remaining. Visit your dashboard at automna.ai/dashboard to purchase more credits.',
        limits: {
          monthlyAutomnaCredits: { used: 0, limit: 0 },
          requestsPerMinute: { used: 0, limit: rpmLimit },
        },
      };
    }
  } else {
    // BYOK and legacy users: check monthly credit budget
    usedAutomnaCredits = await getUsedAutomnaCredits(user.userId);
    
    if (usedAutomnaCredits >= monthlyCreditsLimit) {
      return {
        allowed: false,
        reason: `Monthly service credit limit reached (${usedAutomnaCredits.toLocaleString()} / ${monthlyCreditsLimit.toLocaleString()}). You can purchase additional credits.`,
        limits: {
          monthlyAutomnaCredits: { used: usedAutomnaCredits, limit: monthlyCreditsLimit },
          requestsPerMinute: { used: 0, limit: rpmLimit },
        },
      };
    }
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
  if (rateLimit.requestsThisMinute >= rpmLimit) {
    const secondsUntilReset = 60 - (now % 60);
    return {
      allowed: false,
      reason: `Rate limit exceeded (${rateLimit.requestsThisMinute}/${rpmLimit} requests/min)`,
      retryAfter: secondsUntilReset,
      limits: {
        monthlyAutomnaCredits: { used: usedAutomnaCredits, limit: monthlyCreditsLimit },
        requestsPerMinute: { used: rateLimit.requestsThisMinute, limit: rpmLimit },
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
      monthlyAutomnaCredits: { used: usedAutomnaCredits, limit: monthlyCreditsLimit },
      requestsPerMinute: { used: rateLimit.requestsThisMinute + 1, limit: rpmLimit },
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
