/**
 * Active Session Tracking
 * 
 * Called by the dashboard to report which conversation the user is currently viewing.
 * Used by webhooks (phone calls, etc.) to route notifications to the correct session.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : null;

    if (!sessionKey) {
      return NextResponse.json({ error: "sessionKey required" }, { status: 400 });
    }

    await db.update(machines)
      .set({ 
        lastSessionKey: sessionKey,
        lastActiveAt: new Date(),
      })
      .where(eq(machines.userId, userId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[sessions/active] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
