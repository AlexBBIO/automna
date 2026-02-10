/**
 * Provisioning Status Endpoint
 * 
 * Returns the real-time provisioning status for the current user.
 * When status is "waiting_for_gateway", does a live health check against
 * the OpenClaw gateway and upgrades to "ready" when it responds.
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

    // When status is waiting_for_gateway, do a live health check
    if (status.status === "waiting_for_gateway") {
      const machine = await db.query.machines.findFirst({
        where: eq(machines.userId, userId),
      });
      if (machine?.appName && machine?.gatewayToken) {
        try {
          const resp = await fetch(
            `https://${machine.appName}.fly.dev/ws/api/sessions?token=${machine.gatewayToken}`,
            { method: "GET", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000) }
          );
          if (resp.status === 200) {
            // Gateway is ready! Update status
            await db.update(provisionStatus)
              .set({ status: "ready", updatedAt: new Date() })
              .where(eq(provisionStatus.userId, userId));
            return NextResponse.json({ status: "ready" });
          }
        } catch {
          // Not ready yet - that's fine
        }
      }
      // Still waiting
      return NextResponse.json({
        status: "waiting_for_gateway",
        startedAt: status.startedAt,
        updatedAt: status.updatedAt,
      });
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
