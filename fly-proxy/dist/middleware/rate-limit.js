import { db } from "../lib/db.js";
import { llmRateLimits, creditBalances, PLAN_LIMITS } from "../lib/schema.js";
import { eq, sql } from "drizzle-orm";
import { getUsedAutomnaTokens } from "../lib/usage-events.js";
export async function checkRateLimits(user) {
    // Respect effectivePlan for downgrade grace period
    let activePlan = user.plan;
    const now = Math.floor(Date.now() / 1000);
    if (user.effectivePlan && user.effectivePlanUntil && user.effectivePlanUntil > now) {
        activePlan = user.effectivePlan;
    }
    const limits = PLAN_LIMITS[activePlan] || PLAN_LIMITS[user.plan];
    const currentMinute = Math.floor(now / 60);
    // Check credit budget based on user type
    const isProxy = user.byokProvider === 'proxy';
    let usedAutomnaTokens = 0;
    if (isProxy) {
        // Proxy users: check prepaid credit balance
        const bal = await db.query.creditBalances.findFirst({
            where: eq(creditBalances.userId, user.userId),
        });
        if (!bal || bal.balance <= 0) {
            return {
                allowed: false,
                reason: 'No credits remaining. Purchase more credits to continue.',
                limits: {
                    monthlyAutomnaTokens: { used: 0, limit: 0 },
                    requestsPerMinute: { used: 0, limit: limits.requestsPerMinute },
                },
            };
        }
    }
    else {
        // Legacy/subscription users: check monthly token budget
        usedAutomnaTokens = await getUsedAutomnaTokens(user.userId);
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
    db.update(llmRateLimits).set({ requestsThisMinute: sql `requests_this_minute + 1` })
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
export function rateLimitedResponse(c, result) {
    const headers = { "Content-Type": "application/json" };
    if (result.retryAfter)
        headers["Retry-After"] = result.retryAfter.toString();
    return c.json({
        type: "error",
        error: { type: "rate_limit_error", message: result.reason },
        limits: result.limits,
    }, { status: 429, headers });
}
