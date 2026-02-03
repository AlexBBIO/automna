/**
 * LLM Usage Logging
 * 
 * Logs all LLM API usage to the database for tracking and billing.
 */

import { db } from '@/lib/db';
import { llmUsage } from '@/lib/db/schema';
import { calculateCost } from './pricing';

export interface UsageLogParams {
  userId: string;
  provider: 'anthropic' | 'gemini';
  model: string;
  endpoint: 'chat' | 'embed';
  inputTokens: number;
  outputTokens?: number;
  sessionKey?: string;
  requestId?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Log LLM usage to database.
 * This is non-blocking - we don't await the result.
 */
export function logUsage(params: UsageLogParams): void {
  const {
    userId,
    provider,
    model,
    endpoint,
    inputTokens,
    outputTokens = 0,
    sessionKey,
    requestId,
    durationMs,
    error,
  } = params;
  
  const costMicrodollars = calculateCost(provider, model, inputTokens, outputTokens);
  
  // Fire and forget - don't block the response
  db.insert(llmUsage)
    .values({
      userId,
      provider,
      model,
      endpoint,
      inputTokens,
      outputTokens,
      costMicrodollars,
      sessionKey,
      requestId,
      durationMs,
      error,
    })
    .then(() => {
      console.log(`[llm/usage] Logged: ${provider}/${model} ${inputTokens}+${outputTokens} tokens`);
    })
    .catch((err) => {
      console.error('[llm/usage] Failed to log usage:', err);
    });
}

/**
 * Log usage and wait for it to complete (for testing)
 */
export async function logUsageSync(params: UsageLogParams): Promise<void> {
  const costMicrodollars = calculateCost(
    params.provider,
    params.model,
    params.inputTokens,
    params.outputTokens || 0
  );
  
  await db.insert(llmUsage).values({
    userId: params.userId,
    provider: params.provider,
    model: params.model,
    endpoint: params.endpoint,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens || 0,
    costMicrodollars,
    sessionKey: params.sessionKey,
    requestId: params.requestId,
    durationMs: params.durationMs,
    error: params.error,
  });
}
