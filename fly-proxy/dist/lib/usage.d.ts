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
export declare function logUsage(record: UsageRecord): Promise<void>;
export declare function logUsageBackground(record: UsageRecord): void;
