/**
 * Usage Stats API (Automna Credit System)
 * 
 * Returns Automna Credit usage for the authenticated user.
 * Reads from usage_events table (unified billing).
 * 
 * GET /api/llm/usage
 * Auth: Clerk session (dashboard) or gateway token (agent)
 */

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { usageEvents, machines, LEGACY_PLAN_LIMITS } from '@/lib/db/schema';
import { eq, sql, and, gte } from 'drizzle-orm';
import { authenticateGatewayToken } from '../_lib/auth';
import type { PlanType } from '@/lib/db/schema';

export const runtime = 'edge';

export async function GET(request: Request) {
  // Try Clerk auth first (dashboard)
  let userId: string | null = null;
  let plan: PlanType = 'starter';
  
  const { userId: clerkUserId } = await auth();
  
  if (clerkUserId) {
    userId = clerkUserId;
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkUserId),
    });
    plan = (machine?.plan as PlanType) || 'starter';
  } else {
    // Try gateway token (agent calling for its own usage)
    const user = await authenticateGatewayToken(request);
    if (user) {
      userId = user.userId;
      plan = user.plan;
    }
  }
  
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const limits = LEGACY_PLAN_LIMITS[plan as keyof typeof LEGACY_PLAN_LIMITS];
  
  // Get start of current month (UTC)
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
  
  // Get monthly totals from usage_events
  const monthlyTotalResult = await db
    .select({
      totalAutomnaCredits: sql<number>`COALESCE(SUM(automna_tokens), 0)`.as('total_ac'),
      totalCostMicro: sql<number>`COALESCE(SUM(cost_microdollars), 0)`.as('total_cost'),
      totalRequests: sql<number>`COUNT(*)`.as('total_requests'),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.timestamp, monthStartUnix)
      )
    );
  
  const totalAutomnaCredits = Number(monthlyTotalResult[0]?.totalAutomnaCredits || 0);
  const totalCostMicro = Number(monthlyTotalResult[0]?.totalCostMicro || 0);
  const totalRequests = Number(monthlyTotalResult[0]?.totalRequests || 0);
  
  // Get breakdown by event type
  const breakdownResult = await db
    .select({
      eventType: usageEvents.eventType,
      tokens: sql<number>`COALESCE(SUM(automna_tokens), 0)`.as('tokens'),
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.timestamp, monthStartUnix)
      )
    )
    .groupBy(usageEvents.eventType);
  
  const breakdown: Record<string, number> = {};
  for (const row of breakdownResult) {
    breakdown[row.eventType] = Number(row.tokens);
  }
  
  // Get daily breakdown (last 30 days)
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  
  const dailyResult = await db
    .select({
      day: sql<string>`date(timestamp, 'unixepoch')`.as('day'),
      tokens: sql<number>`SUM(automna_tokens)`.as('tokens'),
      requests: sql<number>`COUNT(*)`.as('requests'),
      cost: sql<number>`SUM(cost_microdollars)`.as('cost'),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.timestamp, thirtyDaysAgo)
      )
    )
    .groupBy(sql`date(timestamp, 'unixepoch')`)
    .orderBy(sql`date(timestamp, 'unixepoch') DESC`)
    .limit(30);
  
  // Calculate end of month
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  
  const percentUsed = Math.min(100, Math.round(
    (totalAutomnaCredits / limits.monthlyAutomnaCredits) * 100
  ));
  
  return Response.json({
    plan,
    period: {
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
    },
    usage: {
      automnaCredits: totalAutomnaCredits,
      requests: totalRequests,
      // Legacy fields for backward compat (will remove later)
      automnaTokens: totalAutomnaCredits,
      totalTokens: totalAutomnaCredits,
      costCents: Math.floor(totalCostMicro / 10_000),
    },
    limits: {
      monthlyAutomnaCredits: limits.monthlyAutomnaCredits,
      requestsPerMinute: limits.requestsPerMinute,
      // Legacy fields for backward compat
      monthlyAutomnaTokens: limits.monthlyAutomnaCredits,
      monthlyTokens: limits.monthlyAutomnaCredits,
      monthlyCostCents: Math.floor(limits.monthlyAutomnaCredits / 100),
    },
    remaining: {
      automnaCredits: Math.max(0, limits.monthlyAutomnaCredits - totalAutomnaCredits),
    },
    percentUsed: {
      tokens: percentUsed,
      cost: percentUsed,  // Same number now — both derived from AC
    },
    breakdown: {
      llm: breakdown.llm || 0,
      search: breakdown.search || 0,
      browser: breakdown.browser || 0,
      call: breakdown.call || 0,
      email: breakdown.email || 0,
      embedding: breakdown.embedding || 0,
    },
    dailyBreakdown: dailyResult.map((d) => ({
      date: d.day,
      tokens: Number(d.tokens || 0),
      requests: Number(d.requests || 0),
      cost: `$${(Number(d.cost || 0) / 1_000_000).toFixed(2)}`,
    })),
  });
}
