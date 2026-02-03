/**
 * LLM Usage Stats API
 * 
 * Returns usage statistics for the authenticated user.
 * Used by the dashboard to show token/cost usage.
 * 
 * GET /api/llm/usage
 * Auth: Clerk session (dashboard) or gateway token (agent)
 */

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { llmUsage, machines, PLAN_LIMITS } from '@/lib/db/schema';
import { eq, sql, and, gte } from 'drizzle-orm';
import { formatCost } from '../_lib/pricing';
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
    // Get plan from machine record
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
  
  const limits = PLAN_LIMITS[plan];
  
  // Get start of current month (UTC)
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
  
  // Get monthly totals
  const monthlyStatsResult = await db
    .select({
      totalRequests: sql<number>`COUNT(*)`.as('total_requests'),
      totalInputTokens: sql<number>`COALESCE(SUM(input_tokens), 0)`.as('total_input'),
      totalOutputTokens: sql<number>`COALESCE(SUM(output_tokens), 0)`.as('total_output'),
      totalCostMicro: sql<number>`COALESCE(SUM(cost_microdollars), 0)`.as('total_cost'),
    })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.userId, userId),
        gte(llmUsage.timestamp, monthStartUnix)
      )
    );
  
  const stats = monthlyStatsResult[0];
  const totalInputTokens = Number(stats?.totalInputTokens || 0);
  const totalOutputTokens = Number(stats?.totalOutputTokens || 0);
  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalCostMicro = Number(stats?.totalCostMicro || 0);
  const totalCostCents = Math.floor(totalCostMicro / 10_000);
  
  // Get daily breakdown (last 30 days)
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  
  const dailyStatsResult = await db
    .select({
      day: sql<string>`date(timestamp, 'unixepoch')`.as('day'),
      requests: sql<number>`COUNT(*)`.as('requests'),
      inputTokens: sql<number>`SUM(input_tokens)`.as('input_tokens'),
      outputTokens: sql<number>`SUM(output_tokens)`.as('output_tokens'),
      cost: sql<number>`SUM(cost_microdollars)`.as('cost'),
    })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.userId, userId),
        gte(llmUsage.timestamp, thirtyDaysAgo)
      )
    )
    .groupBy(sql`date(timestamp, 'unixepoch')`)
    .orderBy(sql`date(timestamp, 'unixepoch') DESC`)
    .limit(30);
  
  // Get model breakdown for this month
  const modelStatsResult = await db
    .select({
      model: llmUsage.model,
      requests: sql<number>`COUNT(*)`.as('requests'),
      tokens: sql<number>`SUM(input_tokens + output_tokens)`.as('tokens'),
      cost: sql<number>`SUM(cost_microdollars)`.as('cost'),
    })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.userId, userId),
        gte(llmUsage.timestamp, monthStartUnix)
      )
    )
    .groupBy(llmUsage.model)
    .orderBy(sql`SUM(cost_microdollars) DESC`)
    .limit(10);
  
  // Calculate end of month
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  
  return Response.json({
    plan,
    period: {
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
    },
    usage: {
      requests: Number(stats?.totalRequests || 0),
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
      cost: formatCost(totalCostMicro),
      costCents: totalCostCents,
    },
    limits: {
      monthlyTokens: limits.monthlyTokens,
      monthlyCostCents: limits.monthlyCostCents,
      requestsPerMinute: limits.requestsPerMinute,
    },
    remaining: {
      tokens: Math.max(0, limits.monthlyTokens - totalTokens),
      costCents: Math.max(0, limits.monthlyCostCents - totalCostCents),
    },
    percentUsed: {
      tokens: Math.min(100, Math.round((totalTokens / limits.monthlyTokens) * 100)),
      cost: Math.min(100, Math.round((totalCostCents / limits.monthlyCostCents) * 100)),
    },
    dailyBreakdown: dailyStatsResult.map((d) => ({
      date: d.day,
      requests: Number(d.requests),
      inputTokens: Number(d.inputTokens || 0),
      outputTokens: Number(d.outputTokens || 0),
      cost: formatCost(Number(d.cost || 0)),
    })),
    modelBreakdown: modelStatsResult.map((m) => ({
      model: m.model,
      requests: Number(m.requests),
      tokens: Number(m.tokens || 0),
      cost: formatCost(Number(m.cost || 0)),
    })),
  });
}
