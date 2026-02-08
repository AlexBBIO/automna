import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";

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
    
    // Check for duplicate email before creating
    // Prevents duplicate accounts when Clerk assigns a new ID for the same email
    if (email) {
      const existingWithEmail = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.email, email),
            ne(users.id, clerkId)
          )
        )
        .limit(1);

      if (existingWithEmail.length > 0) {
        console.warn(
          `[api/user/sync] DUPLICATE EMAIL: ${email} already exists as ${existingWithEmail[0].id}. ` +
          `Clerk ID ${clerkId} appears to be a duplicate account. Skipping creation.`
        );
        return NextResponse.json({
          id: clerkId,
          email,
          name,
          created: false,
          duplicate: true,
        });
      }
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
