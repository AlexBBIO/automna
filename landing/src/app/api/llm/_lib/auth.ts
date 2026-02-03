import { db } from "@/lib/db";
import { machines, type PlanType } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface AuthenticatedUser {
  userId: string;
  appName: string;
  machineId: string;
  plan: PlanType;
}

/**
 * Authenticate a request using the gateway token.
 * 
 * Supports two auth methods:
 * 1. Authorization: Bearer <token> (standard Bearer auth)
 * 2. x-api-key: <token> (Anthropic SDK style)
 * 
 * The Anthropic SDK sends the API key in x-api-key header, so we need to support both.
 */
export async function authenticateGatewayToken(
  request: Request
): Promise<AuthenticatedUser | null> {
  // Try Authorization header first (Bearer token)
  const authHeader = request.headers.get("Authorization");
  let token: string | null = null;
  
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }
  
  // Fall back to x-api-key header (Anthropic SDK style)
  if (!token) {
    token = request.headers.get("x-api-key")?.trim() ?? null;
  }
  
  if (!token) {
    return null;
  }

  try {
    const machine = await db.query.machines.findFirst({
      where: eq(machines.gatewayToken, token),
      columns: { id: true, userId: true, appName: true, plan: true },
    });

    if (!machine) {
      return null;
    }

    return {
      userId: machine.userId,
      appName: machine.appName ?? "unknown",
      machineId: machine.id,
      plan: (machine.plan as PlanType) ?? "starter",
    };
  } catch (error) {
    console.error("[LLM Proxy] Auth error:", error);
    return null;
  }
}

/**
 * Return 401 Unauthorized response (Anthropic error format).
 */
export function unauthorized(message: string = "Invalid or missing gateway token"): Response {
  return new Response(
    JSON.stringify({
      type: "error",
      error: {
        type: "authentication_error",
        message,
      },
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Format an Anthropic-compatible error response.
 */
export function anthropicError(
  status: number,
  type: string,
  message: string
): Response {
  return new Response(
    JSON.stringify({
      type: "error",
      error: {
        type,
        message,
      },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}
