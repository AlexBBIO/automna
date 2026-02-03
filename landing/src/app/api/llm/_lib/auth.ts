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
 * The gateway token is passed as a Bearer token in the Authorization header.
 */
export async function authenticateGatewayToken(
  request: Request
): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
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
