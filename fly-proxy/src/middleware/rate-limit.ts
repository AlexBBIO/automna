import type { Context } from "hono";
import { db } from "../lib/db.js";
import { llmRateLimits, PLAN_LIMITS } from "../lib/schema.js";
import { eq, sql } from "drizzle-orm";
import type { AuthenticatedUser } from "./auth.js";
import { getUsedAutomnaTokens } from "../lib/usage-events.js";

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  limits?: {
    monthlyAutomnaTokens: { used: number; limit: number };
    requestsPerMinute: { used: number; limit: number };
  };
  retryAfter?: number;
}

export async function checkRateLimits(user: AuthenticatedUser): Promise<RateLimitResult> {
  const limits = PLAN_LIMITS[user.plan];
  const now = Math.floor(Date.now() / 1000);
  const currentMinute = Math.floor(now / 60);

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

  let rateLimit = await db.query.llmRateLimits.findFirst({
    where: eq(llmRateLimits.userId, user.userId),
  });

  if (!rateLimit) {
    const [newRateLimit] = await db.insert(llmRateLimits).values({
      userId: user.userId, currentMinute, requestsThisMinute: 0, tokensThisMinute: 0, lastReset: now,
    }).returning();
    rateLimit = newRateLimit;
  }

  if (rateLimit.currentMinute !== currentMinute) {
    await db.update(llmRateLimits).set({
      currentMinute, requestsThisMinute: 0, tokensThisMinute: 0, lastReset: now,
    }).where(eq(llmRateLimits.userId, user.userId));
    rateLimit = { ...rateLimit, currentMinute, requestsThisMinute: 0, tokensThisMinute: 0 };
  }

  if (rateLimit.requestsThisMinute >= limits.requestsPerMinute) {
    const secondsUntilReset = 60 - (now % 60);
    return {
      allowed: false,
      reason: `Rate limit exceeded (${rateLimit.requestsThisMinute}/${limits.requestsPerMinute} requests/min)`,
      retryAfter: secondsUntilReset,
      limits: {
        monthlyAutomnaTokens: { used: usedAutomnaTokens, limit: limits.monthlyAutomnaTokens },
        requestsPerMinute: { used: rateLimit.requestsThisMinute, limit: limits.requestsPerMinute },
      },
    };
  }

  db.update(llmRateLimits).set({ requestsThisMinute: sql`requests_this_minute + 1` })
    .where(eq(llmRateLimits.userId, user.userId))
    .catch(err => console.error('[FLY-PROXY][rate-limit] Failed to increment:', err));

  return {
    allowed: true,
    limits: {
      monthlyAutomnaTokens: { used: usedAutomnaTokens, limit: limits.monthlyAutomnaTokens },
      requestsPerMinute: { used: rateLimit.requestsThisMinute + 1, limit: limits.requestsPerMinute },
    },
  };
}

export function rateLimitedResponse(c: Context, result: RateLimitResult) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (result.retryAfter) headers["Retry-After"] = result.retryAfter.toString();

  return c.json({
    type: "error",
    error: { type: "rate_limit_error", message: result.reason },
    limits: result.limits,
  }, { status: 429, headers });
}
