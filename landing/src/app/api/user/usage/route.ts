import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, usageEvents, LEGACY_PLAN_LIMITS } from "@/lib/db/schema";
import type { PlanType } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

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

    const plan = (userMachine.plan || "starter") as PlanType;
    const limits = LEGACY_PLAN_LIMITS[plan as keyof typeof LEGACY_PLAN_LIMITS] || LEGACY_PLAN_LIMITS.starter;

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

    return NextResponse.json({
      plan,
      used,
      limit: limits.monthlyAutomnaCredits,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (error) {
    console.error("[api/user/usage] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
