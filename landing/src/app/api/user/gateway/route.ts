import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/user/gateway
 * Returns the gateway URL for WebSocket connection.
 * 
 * Per-user Fly app architecture:
 * - Each user has their own Fly app (automna-u-{shortId})
 * - Direct WebSocket connection to user's app: wss://{appName}.fly.dev/ws
 * - No session namespacing needed - entire app is user-isolated
 * 
 * If user doesn't have an app yet, returns needsProvisioning: true
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // Look up user's machine/app in database
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkId),
    });
    
    if (!userMachine || !userMachine.appName) {
      console.log(`[api/user/gateway] No app found for user ${clerkId}, needs provisioning`);
      return NextResponse.json({
        error: "Machine not provisioned",
        needsProvisioning: true,
      }, { status: 404 });
    }
    
    // Get the gateway token for this user's app
    const gatewayToken = userMachine.gatewayToken;
    if (!gatewayToken) {
      console.error(`[api/user/gateway] No gateway token for user ${clerkId}`);
      return NextResponse.json(
        { error: "Gateway token not found" },
        { status: 500 }
      );
    }
    
    // Build URLs for user's dedicated app
    const appDomain = `${userMachine.appName}.fly.dev`;
    const gatewayUrl = `wss://${appDomain}/ws?token=${encodeURIComponent(gatewayToken)}&clientId=webchat`;
    const httpUrl = `https://${appDomain}?token=${encodeURIComponent(gatewayToken)}`;
    
    console.log(`[api/user/gateway] User ${clerkId} -> ${userMachine.appName}`);
    
    return NextResponse.json({
      gatewayUrl,
      httpUrl,
      appName: userMachine.appName,
      machineId: userMachine.id,
      machineStatus: userMachine.status,
      region: userMachine.region,
      // No session prefix needed - entire app is user-isolated
      sessionKey: "main",
      userId: clerkId,
    });
  } catch (error) {
    console.error("[api/user/gateway] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
