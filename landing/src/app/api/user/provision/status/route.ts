/**
 * Provisioning Status Endpoint
 * 
 * Returns the real-time provisioning status for the current user.
 * No provision_status row = check if they have a machine (ready) or not (not_started).
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { provisionStatus, machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await db.query.provisionStatus.findFirst({
      where: eq(provisionStatus.userId, userId),
    });

    if (!status) {
      // No status row - check if user already has a machine (existing user)
      const machine = await db.query.machines.findFirst({
        where: eq(machines.userId, userId),
      });
      if (machine) {
        return NextResponse.json({ status: "ready" });
      }
      return NextResponse.json({ status: "not_started" });
    }

    return NextResponse.json({
      status: status.status,
      error: status.error,
      startedAt: status.startedAt,
      updatedAt: status.updatedAt,
    });
  } catch (error) {
    console.error("[provision/status] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Status check failed" },
      { status: 500 }
    );
  }
}
