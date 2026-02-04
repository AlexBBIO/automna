/**
 * Admin Regenerate Token API
 * 
 * Generate a new gateway token for a user
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: adminId } = await auth();
    
    if (!adminId || !isAdmin(adminId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id: userId } = await params;

    // Get user's machine
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    if (!machine) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    // Generate new token
    const newToken = crypto.randomUUID();

    // Update database
    await db.update(machines)
      .set({ 
        gatewayToken: newToken,
        updatedAt: new Date(),
      })
      .where(eq(machines.id, machine.id));

    // Note: The user will need to reconnect their agent with the new token
    // This could be done by restarting the machine with new env vars
    // For now, we just update the database - a machine restart would pick it up

    return NextResponse.json({ 
      success: true,
      message: "Token regenerated. User will need to restart their agent.",
    });

  } catch (error) {
    console.error("[admin/regenerate-token] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
