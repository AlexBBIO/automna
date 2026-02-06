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
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  sessionKey?: string;
  requestId?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Log LLM usage to the database.
 * Now captures all token types including cache tokens for accurate cost tracking.
 */
export async function logUsage(record: UsageRecord): Promise<void> {
  const id = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const inputTokens = record.inputTokens;
  const outputTokens = record.outputTokens ?? 0;
  const cacheCreationTokens = record.cacheCreationTokens ?? 0;
  const cacheReadTokens = record.cacheReadTokens ?? 0;
  
  const costMicrodollars = calculateCostMicrodollars(
    record.model,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
  );

  // Total tokens for logging (all types count toward limits)
  const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

  // Always log to console for visibility
  console.log(
    `[LLM Usage] user=${record.userId} model=${record.model} ` +
    `input=${inputTokens} output=${outputTokens} ` +
    `cache_create=${cacheCreationTokens} cache_read=${cacheReadTokens} ` +
    `total=${totalTokens} cost=$${(costMicrodollars / 1_000_000).toFixed(4)} ` +
    `duration=${record.durationMs ?? 0}ms` +
    (record.error ? ` error=${record.error}` : "")
  );

  try {
    await db.insert(llmUsage).values({
      id,
      userId: record.userId,
      timestamp,
      provider: record.provider,
      model: record.model,
      endpoint: record.endpoint,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      costMicrodollars,
      sessionKey: record.sessionKey ?? null,
      requestId: record.requestId ?? null,
      durationMs: record.durationMs ?? null,
      error: record.error ?? null,
    });
  } catch (error) {
    // Don't fail the request if usage logging fails
    console.error("[LLM Usage] Failed to log usage:", error);
  }
}

/**
 * Log usage in background (fire and forget).
 * This allows the response to return immediately while logging completes.
 */
export function logUsageBackground(record: UsageRecord): void {
  // Don't await - let it complete in background
  logUsage(record).catch((error) => {
    console.error("[LLM Usage] Background usage logging failed:", error);
  });
}
