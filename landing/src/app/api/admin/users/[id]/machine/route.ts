/**
 * Admin Machine Control API
 * 
 * Start/stop user machines
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_USER_IDS = ["user_38uauJcurhCOJznltOKvU12RCdK"];
const FLY_API_TOKEN = process.env.FLY_API_TOKEN;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: adminId } = await auth();
    
    if (!adminId || !ADMIN_USER_IDS.includes(adminId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id: userId } = await params;
    const { action } = await request.json();

    if (!action || !["start", "stop"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Get user's machine
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    if (!machine || !machine.appName || !machine.id) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    // Call Fly.io API
    const flyEndpoint = action === "start" 
      ? `https://api.machines.dev/v1/apps/${machine.appName}/machines/${machine.id}/start`
      : `https://api.machines.dev/v1/apps/${machine.appName}/machines/${machine.id}/stop`;

    const flyResponse = await fetch(flyEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FLY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!flyResponse.ok) {
      const error = await flyResponse.text();
      console.error(`[admin/machine] Fly.io ${action} failed:`, error);
      return NextResponse.json(
        { error: `Failed to ${action} machine` },
        { status: 500 }
      );
    }

    // Update database
    const newStatus = action === "start" ? "started" : "stopped";
    await db.update(machines)
      .set({ 
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(machines.id, machine.id));

    return NextResponse.json({ 
      success: true, 
      status: newStatus,
    });

  } catch (error) {
    console.error("[admin/machine] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
