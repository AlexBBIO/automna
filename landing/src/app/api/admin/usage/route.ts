/**
 * Admin Usage Analytics API
 * 
 * Returns detailed usage analytics across all users
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, machines, llmUsage, emailSends } from "@/lib/db/schema";
import { eq, gte, and, sql, desc } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId || !isAdmin(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get time range from query params
    const searchParams = request.nextUrl.searchParams;
    const range = searchParams.get("range") || "7d";
    
    const now = new Date();
    let startTime: Date;
    
    switch (range) {
      case "24h":
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    
    const startTimeUnix = Math.floor(startTime.getTime() / 1000);

    // Daily usage over time
    const dailyLlmUsage = await db
      .select({
        date: sql<string>`DATE(${llmUsage.timestamp}, 'unixepoch')`,
        inputTokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${llmUsage.outputTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${llmUsage.costMicrodollars}), 0)`,
        requests: sql<number>`COUNT(*)`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.timestamp, startTimeUnix))
      .groupBy(sql`DATE(${llmUsage.timestamp}, 'unixepoch')`)
      .orderBy(sql`DATE(${llmUsage.timestamp}, 'unixepoch')`);

    const dailyEmails = await db
      .select({
        date: sql<string>`DATE(${emailSends.sentAt}, 'unixepoch')`,
        count: sql<number>`COUNT(*)`,
      })
      .from(emailSends)
      .where(gte(emailSends.sentAt, startTimeUnix))
      .groupBy(sql`DATE(${emailSends.sentAt}, 'unixepoch')`)
      .orderBy(sql`DATE(${emailSends.sentAt}, 'unixepoch')`);

    // By model breakdown
    const byModel = await db
      .select({
        model: llmUsage.model,
        tokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens} + ${llmUsage.outputTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${llmUsage.costMicrodollars}), 0)`,
        requests: sql<number>`COUNT(*)`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.timestamp, startTimeUnix))
      .groupBy(llmUsage.model)
      .orderBy(desc(sql`SUM(${llmUsage.costMicrodollars})`));

    // Top users by cost
    const topUsersByCost = await db
      .select({
        userId: llmUsage.userId,
        tokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens} + ${llmUsage.outputTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${llmUsage.costMicrodollars}), 0)`,
        requests: sql<number>`COUNT(*)`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.timestamp, startTimeUnix))
      .groupBy(llmUsage.userId)
      .orderBy(desc(sql`SUM(${llmUsage.costMicrodollars})`))
      .limit(10);

    // Get user emails for top users
    const topUserIds = topUsersByCost.map(u => u.userId);
    const userEmails = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(topUserIds.map(id => sql`${id}`), sql`, `)})`);
    
    const emailMap = new Map(userEmails.map(u => [u.id, u.email]));

    // Top email senders
    const topEmailSenders = await db
      .select({
        userId: emailSends.userId,
        count: sql<number>`COUNT(*)`,
      })
      .from(emailSends)
      .where(gte(emailSends.sentAt, startTimeUnix))
      .groupBy(emailSends.userId)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    // Totals
    const [totals] = await db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens} + ${llmUsage.outputTokens}), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${llmUsage.costMicrodollars}), 0)`,
        totalRequests: sql<number>`COUNT(*)`,
        uniqueUsers: sql<number>`COUNT(DISTINCT ${llmUsage.userId})`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.timestamp, startTimeUnix));

    const [emailTotals] = await db
      .select({
        totalEmails: sql<number>`COUNT(*)`,
        uniqueSenders: sql<number>`COUNT(DISTINCT ${emailSends.userId})`,
      })
      .from(emailSends)
      .where(gte(emailSends.sentAt, startTimeUnix));

    // Merge daily data
    const emailsMap = new Map(dailyEmails.map(d => [d.date, Number(d.count)]));
    const dailyData = dailyLlmUsage.map(day => ({
      date: day.date,
      inputTokens: Number(day.inputTokens),
      outputTokens: Number(day.outputTokens),
      costMicro: Number(day.cost), // microdollars
      requests: Number(day.requests),
      emails: emailsMap.get(day.date) || 0,
    }));

    return NextResponse.json({
      range,
      totals: {
        tokens: Number(totals?.totalTokens ?? 0),
        costMicro: Number(totals?.totalCost ?? 0), // microdollars
        requests: Number(totals?.totalRequests ?? 0),
        uniqueUsers: Number(totals?.uniqueUsers ?? 0),
        emails: Number(emailTotals?.totalEmails ?? 0),
        uniqueSenders: Number(emailTotals?.uniqueSenders ?? 0),
      },
      daily: dailyData,
      byModel: byModel.map(m => ({
        model: m.model,
        tokens: Number(m.tokens),
        costMicro: Number(m.cost), // microdollars
        requests: Number(m.requests),
      })),
      topUsers: topUsersByCost.map(u => ({
        userId: u.userId,
        email: emailMap.get(u.userId) || "Unknown",
        tokens: Number(u.tokens),
        costMicro: Number(u.cost), // microdollars
        requests: Number(u.requests),
      })),
      topEmailSenders: topEmailSenders.map(u => ({
        userId: u.userId,
        email: emailMap.get(u.userId) || "Unknown",
        count: Number(u.count),
      })),
    });

  } catch (error) {
    console.error("[admin/usage] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
