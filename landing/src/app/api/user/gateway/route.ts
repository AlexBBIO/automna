import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/user/gateway
 * Returns the user's gateway URL and token for WebSocket connection
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
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        gatewayUrl: true,
        gatewayToken: true,
      },
    });
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    
    if (!user.gatewayUrl || !user.gatewayToken) {
      return NextResponse.json(
        { error: "Gateway not configured", status: "not_provisioned" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      gatewayUrl: user.gatewayUrl,
      authToken: user.gatewayToken,
    });
  } catch (error) {
    console.error("[api/user/gateway] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
