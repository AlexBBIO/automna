import { db } from "./db.js";
import { llmUsage } from "./schema.js";
import { calculateCostMicrodollars } from "./pricing.js";
export async function logUsage(record) {
    const id = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const inputTokens = record.inputTokens;
    const outputTokens = record.outputTokens ?? 0;
    const cacheCreationTokens = record.cacheCreationTokens ?? 0;
    const cacheReadTokens = record.cacheReadTokens ?? 0;
    const costMicrodollars = calculateCostMicrodollars(record.model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
    console.log(`[FLY-PROXY][LLM Usage] user=${record.userId} model=${record.model} ` +
        `input=${inputTokens} output=${outputTokens} cache_create=${cacheCreationTokens} cache_read=${cacheReadTokens} ` +
        `total=${totalTokens} cost=$${(costMicrodollars / 1_000_000).toFixed(4)} duration=${record.durationMs ?? 0}ms` +
        (record.error ? ` error=${record.error}` : ""));
    try {
        await db.insert(llmUsage).values({
            id, userId: record.userId, timestamp, provider: record.provider,
            model: record.model, endpoint: record.endpoint, inputTokens, outputTokens,
            cacheCreationTokens, cacheReadTokens, costMicrodollars,
            sessionKey: record.sessionKey ?? null, requestId: record.requestId ?? null,
            durationMs: record.durationMs ?? null, error: record.error ?? null,
        });
    }
    catch (error) {
        console.error("[FLY-PROXY][LLM Usage] Failed to log usage:", error);
    }
}
export function logUsageBackground(record) {
    logUsage(record).catch((error) => {
        console.error("[FLY-PROXY][LLM Usage] Background usage logging failed:", error);
    });
}
