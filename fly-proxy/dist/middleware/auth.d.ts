import type { Context, Next } from "hono";
import { type PlanType } from "../lib/schema.js";
export interface AuthenticatedUser {
    userId: string;
    appName: string;
    machineId: string;
    plan: PlanType;
    byokProvider: string | null;
    effectivePlan: string | null;
    effectivePlanUntil: number | null;
}
export declare function lookupGatewayToken(token: string): Promise<AuthenticatedUser | null>;
/**
 * Extract gateway token from request headers.
 * Supports multiple header formats used by different SDKs.
 */
export declare function extractToken(c: Context, ...headerNames: string[]): string | null;
/**
 * Auth middleware — authenticates and stores user on context.
 * Use extractToken() to get the token from the right header for each proxy.
 */
export declare function authMiddleware(c: Context, next: Next): Promise<(Response & import("hono").TypedResponse<{
    error: string;
}, 401, "json">) | undefined>;
