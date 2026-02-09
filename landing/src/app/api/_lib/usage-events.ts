/**
 * Unified Usage Event Logger (Automna Credit System)
 * 
 * Logs ALL billable activity to the usage_events table.
 * Each event gets an Automna Credit cost: ceil(costMicrodollars / 100).
 * 
 * Used by: LLM proxy, Brave proxy, Browserbase proxy, email, calls, Gemini.
 */

import { db } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { MICRODOLLARS_PER_AUTOMNA_CREDIT } from "./cost-constants";

export type UsageEventType = 'llm' | 'search' | 'browser' | 'call' | 'email' | 'embedding';

interface UsageEventInput {
  userId: string;
  eventType: UsageEventType;
  costMicrodollars: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Convert microdollars to Automna Credits.
 */
export function toAutomnaCredits(costMicrodollars: number): number {
  return Math.ceil(costMicrodollars / MICRODOLLARS_PER_AUTOMNA_CREDIT);
}

/**
 * Log a usage event to the database.
 */
export async function logUsageEvent(input: UsageEventInput): Promise<void> {
  const automnaCredits = toAutomnaCredits(input.costMicrodollars);

  console.log(
    `[Usage] user=${input.userId} type=${input.eventType} ` +
    `AC=${automnaCredits} cost=$${(input.costMicrodollars / 1_000_000).toFixed(4)}` +
    (input.error ? ` error=${input.error}` : "")
  );

  try {
    await db.insert(usageEvents).values({
      userId: input.userId,
      eventType: input.eventType,
      automnaTokens: automnaCredits,
      costMicrodollars: input.costMicrodollars,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      error: input.error ?? null,
    });
  } catch (error) {
    console.error("[Usage] Failed to log event:", error);
  }
}

/**
 * Log a usage event in the background (fire and forget).
 */
export function logUsageEventBackground(input: UsageEventInput): void {
  logUsageEvent(input).catch((error) => {
    console.error("[Usage] Background logging failed:", error);
  });
}

/**
 * Get total Automna Credits used by a user this month.
 */
export async function getUsedAutomnaCredits(userId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(automna_tokens), 0)`.as('total'),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.timestamp, monthStartUnix)
      )
    );

  return Number(result[0]?.total || 0);
}

/**
 * Get Automna Credits used by a user this month, broken down by event type.
 */
export async function getUsedAutomnaTokensByType(
  userId: string
): Promise<Record<string, number>> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

  const result = await db
    .select({
      eventType: usageEvents.eventType,
      total: sql<number>`COALESCE(SUM(automna_tokens), 0)`.as('total'),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.timestamp, monthStartUnix)
      )
    )
    .groupBy(usageEvents.eventType);

  const byType: Record<string, number> = {};
  for (const row of result) {
    byType[row.eventType] = Number(row.total);
  }
  return byType;
}
