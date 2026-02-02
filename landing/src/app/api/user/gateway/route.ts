import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Fly.io gateway URL
const FLY_GATEWAY_WS_URL = process.env.FLY_GATEWAY_WS_URL || "wss://automna-gateway.fly.dev/ws";
const FLY_GATEWAY_HTTP_URL = process.env.FLY_GATEWAY_HTTP_URL || "https://automna-gateway.fly.dev";

/**
 * GET /api/user/gateway
 * Returns the gateway URL for WebSocket connection.
 * 
 * For now, uses simple token auth. Multi-tenant isolation coming later.
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
    
    // Build gateway URL with token and client ID
    // The clientId=webchat allows connections without device pairing when allowInsecureAuth is enabled
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
