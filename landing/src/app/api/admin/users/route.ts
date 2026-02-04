/**
 * Admin Users List API
 * 
 * Returns paginated list of all users with their machine and usage info
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, machines, llmUsage, emailSends } from "@/lib/db/schema";
import { eq, gte, sql, desc } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId || !isAdmin(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Time boundaries
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUnix = Math.floor(todayStart.getTime() / 1000);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

    // Get all users with their machine info
    const usersWithMachines = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
        machineId: machines.id,
        machineStatus: machines.status,
        appName: machines.appName,
        plan: machines.plan,
        lastActiveAt: machines.lastActiveAt,
      })
      .from(users)
      .leftJoin(machines, eq(users.id, machines.userId))
      .orderBy(desc(users.createdAt));

    // Get usage stats for each user
    const userIds = usersWithMachines.map(u => u.id);
    
    // API cost this month per user
    const apiCostByUser = await db
      .select({
        userId: llmUsage.userId,
        totalCost: sql<number>`COALESCE(SUM(${llmUsage.costMicrodollars}), 0)`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.timestamp, monthStartUnix))
      .groupBy(llmUsage.userId);

    const apiCostMap = new Map(apiCostByUser.map(r => [r.userId, Number(r.totalCost)]));

    // Emails today per user
    const emailsByUser = await db
      .select({
        userId: emailSends.userId,
        count: sql<number>`COUNT(*)`,
      })
      .from(emailSends)
      .where(gte(emailSends.sentAt, todayStartUnix))
      .groupBy(emailSends.userId);

    const emailsMap = new Map(emailsByUser.map(r => [r.userId, Number(r.count)]));

    // Build response
    const usersData = usersWithMachines.map(user => ({
      id: user.id,
      clerkId: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan || "starter",
      machineStatus: user.machineStatus,
      appName: user.appName,
      // Convert microdollars to cents
      apiCostMonth: Math.round((apiCostMap.get(user.id) || 0) / 10000),
      emailsToday: emailsMap.get(user.id) || 0,
      lastActiveAt: user.lastActiveAt?.toISOString() || null,
      createdAt: user.createdAt?.toISOString() || null,
    }));

    return NextResponse.json({ users: usersData });

  } catch (error) {
    console.error("[admin/users] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
