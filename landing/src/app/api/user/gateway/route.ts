import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

// Moltworker base URL (WebSocket endpoint)
const MOLTWORKER_WS_URL = process.env.MOLTWORKER_WS_URL || "wss://moltbot-sandbox.alex-0bb.workers.dev/ws";

// URL expiry time (1 hour)
const URL_EXPIRY_SECONDS = 3600;

/**
 * Generate a signed URL for multi-user isolation.
 * 
 * The signature is HMAC-SHA256(userId.exp, secret) in base64url format.
 * This prevents users from tampering with their userId to access other users' sandboxes.
 */
function generateSignedUrl(userId: string, secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + URL_EXPIRY_SECONDS;
  const payload = `${userId}.${exp}`;
  
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  
  return `${MOLTWORKER_WS_URL}?userId=${encodeURIComponent(userId)}&exp=${exp}&sig=${sig}`;
}

/**
 * GET /api/user/gateway
 * Returns a signed gateway URL for WebSocket connection.
 * 
 * The URL includes the user's Clerk ID and an HMAC signature,
 * which the Moltworker validates to route to the correct per-user sandbox.
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
    
    // Check for signing secret
    const signingSecret = process.env.MOLTBOT_SIGNING_SECRET;
    if (!signingSecret) {
      console.error("[api/user/gateway] MOLTBOT_SIGNING_SECRET not configured");
      return NextResponse.json(
        { error: "Gateway not configured" },
        { status: 503 }
      );
    }
    
    // Generate signed URL
    const gatewayUrl = generateSignedUrl(clerkId, signingSecret);
    
    return NextResponse.json({
      gatewayUrl,
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
