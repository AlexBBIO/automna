import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, usageEvents, creditBalances, LEGACY_PLAN_LIMITS } from "@/lib/db/schema";
import type { PlanType } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { isByokUser } from "@/lib/user-type";

/**
 * GET /api/user/usage
 * Returns current billing period usage vs plan limits.
 * 
 * Billing period is calendar month (1st to 1st).
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's machine (has plan info)
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkId),
    });

    if (!userMachine) {
      return NextResponse.json(
        { error: "Machine not provisioned" },
        { status: 404 }
      );
    }

    // Determine effective plan for limits
    // If there's a pending downgrade, use the higher plan until the period ends
    let plan = (userMachine.plan || "starter") as PlanType;
    const now_ts = Math.floor(Date.now() / 1000);
    if (userMachine.effectivePlan && userMachine.effectivePlanUntil && userMachine.effectivePlanUntil > now_ts) {
      plan = userMachine.effectivePlan as PlanType;
    }
    const legacyLimits = LEGACY_PLAN_LIMITS[plan as keyof typeof LEGACY_PLAN_LIMITS] || LEGACY_PLAN_LIMITS.starter;
    
    // BYOK users bypass all credit limits — they pay Anthropic directly
    const isByok = isByokUser(userMachine.byokProvider);
    const monthlyCreditsLimit = isByok ? Infinity : legacyLimits.monthlyAutomnaCredits;

    // Current billing period: 1st of current month to 1st of next month (UTC)
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const periodStartUnix = Math.floor(periodStart.getTime() / 1000);

    // Sum automna_tokens for this billing period
    const result = await db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${usageEvents.automnaTokens}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, clerkId),
          gte(usageEvents.timestamp, periodStartUnix)
        )
      );

    const used = Number(result[0]?.totalTokens ?? 0);

    // For proxy (bill-as-you-go) users, show prepaid credit balance instead of fixed monthly limit
    const isProxy = userMachine.byokProvider === 'proxy';
    let creditBalance = 0;
    if (isProxy) {
      const bal = await db.query.creditBalances.findFirst({
        where: eq(creditBalances.userId, clerkId),
      });
      creditBalance = bal?.balance ?? 0;
    }

    return NextResponse.json({
      plan,
      used,
      // Proxy users: limit = their purchased credits + what they've used (so the bar makes sense)
      // BYOK users: small service credit allowance from new PLAN_LIMITS
      // Legacy users: generous monthly allowance from LEGACY_PLAN_LIMITS
      limit: isProxy ? (creditBalance + used) : (isByok ? null : monthlyCreditsLimit),
      creditBalance: isProxy ? creditBalance : undefined,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      isByok,
      isProxy,
    });
  } catch (error) {
    console.error("[api/user/usage] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
