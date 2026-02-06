/**
 * Voice Call Usage API
 * 
 * Get call usage stats and recent call history.
 * Auth: Clerk session OR gateway token.
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, phoneNumbers, callUsage, PLAN_LIMITS } from "@/lib/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    let userId: string | null = null;
    let plan: string = "starter";

    // Try Clerk auth
    const { userId: clerkUserId } = await auth();
    if (clerkUserId) {
      userId = clerkUserId;
      const machine = await db.query.machines.findFirst({
        where: eq(machines.userId, clerkUserId),
      });
      plan = machine?.plan || "starter";
    }

    // Try gateway token
    if (!userId) {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (token) {
        const machine = await db.query.machines.findFirst({
          where: eq(machines.gatewayToken, token),
        });
        if (machine) {
          userId = machine.userId;
          plan = machine.plan || "starter";
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];

    // Get user's phone number
    const userPhone = await db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.userId, userId),
    });

    // Calculate monthly usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyStats = await db
      .select({
        totalSeconds: sql<number>`COALESCE(SUM(${callUsage.durationSeconds}), 0)`,
        totalCalls: sql<number>`COUNT(*)`,
        totalCostCents: sql<number>`COALESCE(SUM(${callUsage.costCents}), 0)`,
      })
      .from(callUsage)
      .where(and(
        eq(callUsage.userId, userId),
        gte(callUsage.createdAt, startOfMonth)
      ));

    const usedMinutes = Math.ceil((monthlyStats[0]?.totalSeconds || 0) / 60);

    // Get recent calls
    const recentCalls = await db
      .select()
      .from(callUsage)
      .where(eq(callUsage.userId, userId))
      .orderBy(desc(callUsage.createdAt))
      .limit(20);

    return NextResponse.json({
      phone_number: userPhone?.phoneNumber || null,
      voice_id: userPhone?.voiceId || null,
      agent_name: userPhone?.agentName || null,
      plan,
      usage: {
        used_minutes: usedMinutes,
        limit_minutes: limits.monthlyCallMinutes || 0,
        remaining_minutes: Math.max(0, (limits.monthlyCallMinutes || 0) - usedMinutes),
        total_calls: monthlyStats[0]?.totalCalls || 0,
        total_cost_cents: monthlyStats[0]?.totalCostCents || 0,
      },
      recent_calls: recentCalls.map(call => ({
        id: call.id,
        call_id: call.blandCallId,
        direction: call.direction,
        to: call.toNumber,
        from: call.fromNumber,
        status: call.status,
        duration_seconds: call.durationSeconds,
        summary: call.summary,
        created_at: call.createdAt,
      })),
    });

  } catch (error) {
    console.error("[call/usage] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
