import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/user/sync
 * Ensures the current Clerk user exists in our Turso database.
 * Creates them if they don't exist.
 * 
 * This syncs to Turso (Drizzle) which is used for machine provisioning.
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
    const name = clerkUser?.firstName 
      ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim()
      : undefined;
    
    // Check if user exists in Turso
    const existingUser = await db.query.users.findFirst({
      where: eq(users.id, clerkId),
    });
    
    if (existingUser) {
      // Update existing user
      await db.update(users)
        .set({ 
          email, 
          name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, clerkId));
      
      console.log(`[api/user/sync] Updated user ${clerkId}`);
      
      return NextResponse.json({
        id: clerkId,
        email,
        name,
        created: false,
      });
    }
    
    // Create new user
    await db.insert(users).values({
      id: clerkId,
      email,
      name,
    });
    
    console.log(`[api/user/sync] Created user ${clerkId}`);
    
    return NextResponse.json({
      id: clerkId,
      email,
      name,
      created: true,
    });
  } catch (error) {
    console.error("[api/user/sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
