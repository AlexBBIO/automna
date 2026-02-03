import { db } from "@/lib/db";
import { llmUsage } from "@/lib/db/schema";
import { calculateCostMicrodollars } from "./pricing";

export interface UsageRecord {
  userId: string;
  provider: string;
  model: string;
  endpoint: string;
  inputTokens: number;
  outputTokens?: number;
  sessionKey?: string;
  requestId?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Log LLM usage to the database.
 */
export async function logUsage(record: UsageRecord): Promise<void> {
  const id = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const costMicrodollars = calculateCostMicrodollars(
    record.model,
    record.inputTokens,
    record.outputTokens ?? 0
  );

  try {
    await db.insert(llmUsage).values({
      id,
      userId: record.userId,
      timestamp,
      provider: record.provider,
      model: record.model,
      endpoint: record.endpoint,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens ?? 0,
      costMicrodollars,
      sessionKey: record.sessionKey ?? null,
      requestId: record.requestId ?? null,
      durationMs: record.durationMs ?? null,
      error: record.error ?? null,
    });
  } catch (error) {
    // Don't fail the request if usage logging fails
    console.error("[LLM Proxy] Failed to log usage:", error);
  }
}

/**
 * Log usage in background (fire and forget).
 * This allows the response to return immediately while logging completes.
 */
export function logUsageBackground(record: UsageRecord): void {
  // Don't await - let it complete in background
  logUsage(record).catch((error) => {
    console.error("[LLM Proxy] Background usage logging failed:", error);
  });
}
