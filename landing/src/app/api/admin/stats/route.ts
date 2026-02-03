/**
 * Admin Stats API
 * 
 * Returns dashboard overview statistics
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, machines, llmUsage, emailSends } from "@/lib/db/schema";
import { eq, gte, sql, count, sum } from "drizzle-orm";

const ADMIN_USER_IDS = ["user_38uauJcurhCOJznltOKvU12RCdK"];

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Time boundaries
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUnix = Math.floor(todayStart.getTime() / 1000);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
    
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Run queries in parallel
    const [
      totalUsersResult,
      machineStatsResult,
      apiCostTodayResult,
      apiCostMonthResult,
      emailsTodayResult,
      emailsMonthResult,
      tokensTodayResult,
      tokensMonthResult,
    ] = await Promise.all([
      // Total users
      db.select({ count: count() }).from(users),
      
      // Machine stats
      db.select({ 
        total: count(),
        active: sum(sql`CASE WHEN ${machines.status} = 'started' THEN 1 ELSE 0 END`),
      }).from(machines),
      
      // API cost today (in cents)
      db.select({ 
        total: sum(llmUsage.costMicrodollars)
      }).from(llmUsage).where(gte(llmUsage.timestamp, todayStartUnix)),
      
      // API cost this month
      db.select({ 
        total: sum(llmUsage.costMicrodollars)
      }).from(llmUsage).where(gte(llmUsage.timestamp, monthStartUnix)),
      
      // Emails today
      db.select({ count: count() }).from(emailSends).where(gte(emailSends.sentAt, todayStartUnix)),
      
      // Emails this month
      db.select({ count: count() }).from(emailSends).where(gte(emailSends.sentAt, monthStartUnix)),
      
      // Tokens today
      db.select({ 
        total: sum(sql`${llmUsage.inputTokens} + ${llmUsage.outputTokens}`)
      }).from(llmUsage).where(gte(llmUsage.timestamp, todayStartUnix)),
      
      // Tokens this month
      db.select({ 
        total: sum(sql`${llmUsage.inputTokens} + ${llmUsage.outputTokens}`)
      }).from(llmUsage).where(gte(llmUsage.timestamp, monthStartUnix)),
    ]);

    // Count active users (machines with recent activity)
    const activeUsersResult = await db
      .select({ count: count() })
      .from(machines)
      .where(gte(machines.lastActiveAt, yesterday));

    return NextResponse.json({
      totalUsers: totalUsersResult[0]?.count ?? 0,
      activeUsers24h: activeUsersResult[0]?.count ?? 0,
      activeMachines: Number(machineStatsResult[0]?.active ?? 0),
      totalMachines: machineStatsResult[0]?.total ?? 0,
      // Return microdollars - UI will convert to dollars
      apiCostTodayMicro: Number(apiCostTodayResult[0]?.total ?? 0),
      apiCostMonthMicro: Number(apiCostMonthResult[0]?.total ?? 0),
      emailsToday: emailsTodayResult[0]?.count ?? 0,
      emailsMonth: emailsMonthResult[0]?.count ?? 0,
      tokensToday: Number(tokensTodayResult[0]?.total ?? 0),
      tokensMonth: Number(tokensMonthResult[0]?.total ?? 0),
    });

  } catch (error) {
    console.error("[admin/stats] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
