import type { Context, Next } from "hono";
import { db } from "../lib/db.js";
import { machines, type PlanType } from "../lib/schema.js";
import { eq } from "drizzle-orm";

export interface AuthenticatedUser {
  userId: string;
  appName: string;
  machineId: string;
  plan: PlanType;
}

// In-memory cache for gateway tokens (5 min TTL)
const tokenCache = new Map<string, { user: AuthenticatedUser; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function lookupGatewayToken(token: string): Promise<AuthenticatedUser | null> {
  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  try {
    const machine = await db.query.machines.findFirst({
      where: eq(machines.gatewayToken, token),
      columns: { id: true, userId: true, appName: true, plan: true },
    });
    if (!machine) return null;

    const user: AuthenticatedUser = {
      userId: machine.userId,
      appName: machine.appName ?? "unknown",
      machineId: machine.id,
      plan: (machine.plan as PlanType) ?? "starter",
    };

    tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL });
    return user;
  } catch (error) {
    console.error("[FLY-PROXY][Auth] Error:", error);
    return null;
  }
}

/**
 * Extract gateway token from request headers.
 * Supports multiple header formats used by different SDKs.
 */
export function extractToken(c: Context, ...headerNames: string[]): string | null {
  // Try Authorization: Bearer first
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  // Try x-api-key (Anthropic SDK)
  const apiKey = c.req.header("x-api-key")?.trim();
  if (apiKey) return apiKey;

  // Try custom header names
  for (const name of headerNames) {
    const value = c.req.header(name)?.trim();
    if (value) return value;
  }

  return null;
}

/**
 * Auth middleware — authenticates and stores user on context.
 * Use extractToken() to get the token from the right header for each proxy.
 */
export async function authMiddleware(c: Context, next: Next) {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: "Missing authentication" }, 401);
  }

  const user = await lookupGatewayToken(token);
  if (!user) {
    return c.json({ error: "Invalid gateway token" }, 401);
  }

  c.set("user", user);
  await next();
}
