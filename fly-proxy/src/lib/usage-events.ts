import { db } from "./db.js";
import { usageEvents, machines, creditBalances } from "./schema.js";
import { eq, and, gte, sql } from "drizzle-orm";
import { MICRODOLLARS_PER_AUTOMNA_TOKEN } from "./cost-constants.js";

export type UsageEventType = 'llm' | 'search' | 'browser' | 'call' | 'email' | 'embedding';

interface UsageEventInput {
  userId: string;
  eventType: UsageEventType;
  costMicrodollars: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

export function toAutomnaTokens(costMicrodollars: number): number {
  return Math.ceil(costMicrodollars / MICRODOLLARS_PER_AUTOMNA_TOKEN);
}

export async function logUsageEvent(input: UsageEventInput): Promise<void> {
  const automnaTokens = toAutomnaTokens(input.costMicrodollars);
  console.log(
    `[FLY-PROXY][Usage] user=${input.userId} type=${input.eventType} ` +
    `AT=${automnaTokens} cost=$${(input.costMicrodollars / 1_000_000).toFixed(4)}` +
    (input.error ? ` error=${input.error}` : "")
  );
  try {
    await db.insert(usageEvents).values({
      userId: input.userId,
      eventType: input.eventType,
      automnaTokens,
      costMicrodollars: input.costMicrodollars,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      error: input.error ?? null,
    });

    // Deduct from prepaid credit balance if user has one
    if (automnaTokens > 0 && !input.error) {
      try {
        const bal = await db.query.creditBalances.findFirst({
          where: eq(creditBalances.userId, input.userId),
        });
        if (bal && bal.balance > 0) {
          const newBalance = Math.max(0, bal.balance - automnaTokens);
          await db.update(creditBalances)
            .set({ balance: newBalance, updatedAt: new Date() })
            .where(eq(creditBalances.userId, input.userId));
        }
      } catch (e) {
        console.error("[FLY-PROXY][Usage] Credit deduction failed:", e);
      }
    }
  } catch (error) {
    console.error("[FLY-PROXY][Usage] Failed to log event:", error);
  }
}

export function logUsageEventBackground(input: UsageEventInput): void {
  logUsageEvent(input).catch((error) => {
    console.error("[FLY-PROXY][Usage] Background logging failed:", error);
  });
}

// Debounced last-active update: only writes if >60s since last update for this machine
const lastActiveCache = new Map<string, number>();
const LAST_ACTIVE_DEBOUNCE_MS = 60_000;

export function updateLastActiveBackground(machineId: string): void {
  const now = Date.now();
  const lastUpdate = lastActiveCache.get(machineId) || 0;
  if (now - lastUpdate < LAST_ACTIVE_DEBOUNCE_MS) return;

  lastActiveCache.set(machineId, now);
  db.update(machines)
    .set({ lastActiveAt: new Date() })
    .where(eq(machines.id, machineId))
    .execute()
    .catch((err) => console.error("[FLY-PROXY][LastActive] Failed to update:", err));
}

export async function getUsedAutomnaTokens(userId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(automna_tokens), 0)`.as('total') })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.timestamp, monthStartUnix)));

  return Number(result[0]?.total || 0);
}
