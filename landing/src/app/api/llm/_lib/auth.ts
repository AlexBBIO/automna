/**
 * LLM Proxy Authentication
 * 
 * Authenticates requests using gateway token from user's Fly machine.
 */

import { db } from '@/lib/db';
import { machines } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PlanType } from '@/lib/db/schema';

export interface AuthenticatedUser {
  userId: string;
  machineId: string;
  appName: string;
  plan: PlanType;
}

/**
 * Authenticate a request using gateway token.
 * Returns user info or null if invalid.
 */
export async function authenticateGatewayToken(
  request: Request
): Promise<AuthenticatedUser | null> {
  // Extract token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }
  
  // Look up machine by gateway token
  const machine = await db.query.machines.findFirst({
    where: eq(machines.gatewayToken, token),
  });
  
  if (!machine) {
    return null;
  }
  
  return {
    userId: machine.userId,
    machineId: machine.id,
    appName: machine.appName || '',
    plan: (machine.plan || 'starter') as PlanType,
  };
}

/**
 * Return 401 Unauthorized response (Anthropic error format)
 */
export function unauthorized(message = 'Unauthorized') {
  return Response.json(
    { 
      type: 'error',
      error: { 
        type: 'authentication_error', 
        message 
      } 
    },
    { status: 401 }
  );
}
