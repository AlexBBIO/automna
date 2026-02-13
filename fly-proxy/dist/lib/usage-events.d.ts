export type UsageEventType = 'llm' | 'search' | 'browser' | 'call' | 'email' | 'embedding';
interface UsageEventInput {
    userId: string;
    eventType: UsageEventType;
    costMicrodollars: number;
    metadata?: Record<string, unknown>;
    error?: string;
}
export declare function toAutomnaTokens(costMicrodollars: number): number;
export declare function logUsageEvent(input: UsageEventInput): Promise<void>;
export declare function logUsageEventBackground(input: UsageEventInput): void;
export declare function updateLastActiveBackground(machineId: string): void;
export declare function getUsedAutomnaTokens(userId: string): Promise<number>;
export {};
