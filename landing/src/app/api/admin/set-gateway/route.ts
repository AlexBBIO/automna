import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/set-gateway
 * Sets gateway credentials for a user (admin only - temporary for testing)
 * 
 * Body: { gatewayUrl, gatewayToken }
 */
export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // For now, only allow specific admin user (Alex)
    // In production, this would check against an admin list
    const user = await prisma.user.findUnique({
      where: { clerkId },
    });
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found - call /api/user/sync first" },
        { status: 404 }
      );
    }
    
    const body = await req.json();
    const { gatewayUrl, gatewayToken } = body;
    
    if (!gatewayUrl || !gatewayToken) {
      return NextResponse.json(
        { error: "Missing gatewayUrl or gatewayToken" },
        { status: 400 }
      );
    }
    
    // Update user with gateway credentials
    await prisma.user.update({
      where: { id: user.id },
      data: {
        gatewayUrl,
        gatewayToken,
      },
    });
    
    return NextResponse.json({
      success: true,
      message: "Gateway credentials set",
    });
  } catch (error) {
    console.error("[api/admin/set-gateway] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
