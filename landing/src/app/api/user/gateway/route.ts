import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, machines } from "@/lib/db";
import { eq } from "drizzle-orm";

// Fallback to shared gateway for MVP (until multi-tenant is ready)
const FLY_GATEWAY_WS_URL = process.env.FLY_GATEWAY_WS_URL || "wss://automna-gateway.fly.dev/ws";
const FLY_GATEWAY_HTTP_URL = process.env.FLY_GATEWAY_HTTP_URL || "https://automna-gateway.fly.dev";
const MULTI_TENANT_ENABLED = process.env.MULTI_TENANT_ENABLED === "true";

/**
 * GET /api/user/gateway
 * Returns the gateway URL for WebSocket connection.
 * 
 * Multi-tenant mode (MULTI_TENANT_ENABLED=true):
 * - Looks up user's machine in Turso
 * - Returns URL to user's specific Fly machine
 * 
 * MVP mode (default):
 * - Returns shared gateway URL
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
    
    // Get gateway token
    const gatewayToken = process.env.FLY_GATEWAY_TOKEN;
    if (!gatewayToken) {
      console.error("[api/user/gateway] FLY_GATEWAY_TOKEN not configured");
      return NextResponse.json(
        { error: "Gateway not configured" },
        { status: 503 }
      );
    }
    
    // Multi-tenant mode: look up user's machine
    if (MULTI_TENANT_ENABLED) {
      const userMachine = await db.query.machines.findFirst({
        where: eq(machines.userId, clerkId),
      });
      
      if (!userMachine) {
        // User needs to be provisioned first
        return NextResponse.json(
          { error: "Machine not provisioned", needsProvisioning: true },
          { status: 404 }
        );
      }
      
      // Build URL to user's specific machine
      // Fly machines are accessible at {machine-id}.vm.{app-name}.internal:port
      // For external access, we use the app's fly.dev domain with machine routing
      const machineGatewayUrl = `wss://${userMachine.id}.automna-agents.fly.dev/ws?token=${encodeURIComponent(gatewayToken)}&clientId=webchat`;
      const machineHttpUrl = `https://${userMachine.id}.automna-agents.fly.dev?token=${encodeURIComponent(gatewayToken)}`;
      
      return NextResponse.json({
        gatewayUrl: machineGatewayUrl,
        httpUrl: machineHttpUrl,
        sessionKey: "main",
        machineId: userMachine.id,
      });
    }
    
    // MVP mode: shared gateway
    const gatewayUrl = `${FLY_GATEWAY_WS_URL}?token=${encodeURIComponent(gatewayToken)}&clientId=webchat`;
    
    return NextResponse.json({
      gatewayUrl,
      httpUrl: `${FLY_GATEWAY_HTTP_URL}?token=${encodeURIComponent(gatewayToken)}`,
      sessionKey: "main",
    });
  } catch (error) {
    console.error("[api/user/gateway] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
