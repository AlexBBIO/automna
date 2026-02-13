import type { Context } from "hono";
import type { AuthenticatedUser } from "./auth.js";
export interface RateLimitResult {
    allowed: boolean;
    reason?: string;
    limits?: {
        monthlyAutomnaTokens: {
            used: number;
            limit: number;
        };
        requestsPerMinute: {
            used: number;
            limit: number;
        };
    };
    retryAfter?: number;
}
export declare function checkRateLimits(user: AuthenticatedUser): Promise<RateLimitResult>;
export declare function rateLimitedResponse(c: Context, result: RateLimitResult): Response & import("hono").TypedResponse<{
    type: string;
    error: {
        type: string;
        message: string | undefined;
    };
    limits: {
        monthlyAutomnaTokens: {
            used: number;
            limit: number;
        };
        requestsPerMinute: {
            used: number;
            limit: number;
        };
    } | undefined;
}, 429, "json">;
