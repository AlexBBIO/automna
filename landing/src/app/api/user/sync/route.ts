import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/user/sync
 * Ensures the current Clerk user exists in our database.
 * Creates them if they don't exist.
 * 
 * Note: Gateway URLs are now generated dynamically via signed URLs,
 * so we no longer store gatewayUrl/gatewayToken in the database.
 */
export async function POST() {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress;
    
    if (!email) {
      return NextResponse.json(
        { error: "No email found" },
        { status: 400 }
      );
    }
    
    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { clerkId },
      update: { email },
      create: {
        clerkId,
        email,
        plan: 'free',
      },
    });
    
    // Gateway is always available via signed URLs
    // (as long as MOLTBOT_SIGNING_SECRET is configured)
    const hasGateway = !!process.env.MOLTBOT_SIGNING_SECRET;
    
    return NextResponse.json({
      id: user.id,
      email: user.email,
      plan: user.plan,
      hasGateway,
    });
  } catch (error) {
    console.error("[api/user/sync] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
