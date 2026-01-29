import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/user/sync
 * Ensures the current Clerk user exists in our database
 * Creates them if they don't exist
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
    
    // Check if this is the test user (grandathrawn)
    const isTestUser = email === 'grandathrawn@gmail.com';
    
    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { clerkId },
      update: { 
        email,
        // Auto-configure gateway for test user
        ...(isTestUser && {
          gatewayUrl: 'wss://test.automna.ai',
          gatewayToken: 'test123',
        }),
      },
      create: {
        clerkId,
        email,
        plan: 'free',
        // Auto-configure gateway for test user
        ...(isTestUser && {
          gatewayUrl: 'wss://test.automna.ai',
          gatewayToken: 'test123',
        }),
      },
    });
    
    return NextResponse.json({
      id: user.id,
      email: user.email,
      plan: user.plan,
      hasGateway: !!(user.gatewayUrl && user.gatewayToken),
    });
  } catch (error) {
    console.error("[api/user/sync] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
