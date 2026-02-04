/**
 * Admin User Detail API
 * 
 * Returns detailed information about a specific user
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, machines, llmUsage, emailSends, PLAN_LIMITS, PlanType } from "@/lib/db/schema";
import { eq, gte, and, sql, desc } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: adminId } = await auth();
    
    if (!adminId || !isAdmin(adminId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id: userId } = await params;

    // Get user with machine info
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    // Time boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

    // Get plan limits
    const plan = (machine?.plan || "starter") as PlanType;
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

    // Get usage this month
    const [tokenUsage] = await db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens} + ${llmUsage.outputTokens}), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${llmUsage.costMicrodollars}), 0)`,
      })
      .from(llmUsage)
      .where(and(
        eq(llmUsage.userId, userId),
        gte(llmUsage.timestamp, monthStartUnix)
      ));

    const [emailUsage] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(emailSends)
      .where(and(
        eq(emailSends.userId, userId),
        gte(emailSends.sentAt, monthStartUnix)
      ));

    // Get recent daily usage (last 7 days)
    const sevenDaysAgo = Math.floor((now.getTime() - 7 * 24 * 60 * 60 * 1000) / 1000);
    
    const dailyUsage = await db
      .select({
        date: sql<string>`DATE(${llmUsage.timestamp}, 'unixepoch')`,
        tokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens} + ${llmUsage.outputTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${llmUsage.costMicrodollars}), 0)`,
      })
      .from(llmUsage)
      .where(and(
        eq(llmUsage.userId, userId),
        gte(llmUsage.timestamp, sevenDaysAgo)
      ))
      .groupBy(sql`DATE(${llmUsage.timestamp}, 'unixepoch')`)
      .orderBy(desc(sql`DATE(${llmUsage.timestamp}, 'unixepoch')`));

    const dailyEmails = await db
      .select({
        date: sql<string>`DATE(${emailSends.sentAt}, 'unixepoch')`,
        count: sql<number>`COUNT(*)`,
      })
      .from(emailSends)
      .where(and(
        eq(emailSends.userId, userId),
        gte(emailSends.sentAt, sevenDaysAgo)
      ))
      .groupBy(sql`DATE(${emailSends.sentAt}, 'unixepoch')`);

    const emailsMap = new Map(dailyEmails.map(d => [d.date, Number(d.count)]));

    // Combine daily usage
    const recentUsage = dailyUsage.map(day => ({
      date: day.date,
      tokens: Number(day.tokens),
      cost: Math.round(Number(day.cost) / 10000), // Convert to cents
      emails: emailsMap.get(day.date) || 0,
    }));

    return NextResponse.json({
      // User info
      clerkId: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt?.toISOString(),
      
      // Billing (would come from Clerk metadata in production)
      plan,
      stripeCustomerId: null, // TODO: Get from Clerk metadata
      subscriptionStatus: null,
      
      // Machine
      machineId: machine?.id || null,
      appName: machine?.appName || null,
      region: machine?.region || null,
      machineStatus: machine?.status || null,
      ipAddress: machine?.ipAddress || null,
      gatewayToken: machine?.gatewayToken || null,
      agentmailInboxId: machine?.agentmailInboxId || null,
      browserbaseContextId: machine?.browserbaseContextId || null,
      lastActiveAt: machine?.lastActiveAt?.toISOString() || null,
      
      // Usage
      usage: {
        tokensMonth: Number(tokenUsage?.totalTokens ?? 0),
        tokenLimit: limits.monthlyTokens,
        costMonth: Math.round(Number(tokenUsage?.totalCost ?? 0) / 10000), // cents
        costLimit: limits.monthlyCostCents,
        emailsMonth: Number(emailUsage?.count ?? 0),
        emailLimit: 30 * 50, // 50 per day * 30 days
      },
      
      recentUsage,
    });

  } catch (error) {
    console.error("[admin/users/[id]] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
