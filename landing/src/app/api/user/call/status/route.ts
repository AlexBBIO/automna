/**
 * Voice Call Status API
 * 
 * Get the status and transcript of a specific call.
 * Used by agents to poll for call completion after initiating a call.
 * Auth: Gateway token in Authorization header.
 * 
 * GET /api/user/call/status?call_id=<bland_call_id>
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, callUsage } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    // 1. Validate gateway token
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }

    const machine = await db.query.machines.findFirst({
      where: eq(machines.gatewayToken, token),
    });

    if (!machine) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // 2. Get call_id from query params
    const callId = req.nextUrl.searchParams.get("call_id");
    if (!callId) {
      return NextResponse.json({ error: "Missing call_id parameter" }, { status: 400 });
    }

    // 3. Look up call record (scoped to this user)
    const call = await db.query.callUsage.findFirst({
      where: and(
        eq(callUsage.blandCallId, callId),
        eq(callUsage.userId, machine.userId),
      ),
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // 4. Return call details
    const isComplete = call.status !== "initiated" && call.status !== "ringing";

    return NextResponse.json({
      call_id: call.blandCallId,
      status: call.status,
      completed: isComplete,
      direction: call.direction,
      to: call.toNumber,
      from: call.fromNumber,
      duration_seconds: call.durationSeconds || 0,
      summary: call.summary || null,
      transcript: call.transcript || null,
      recording_url: call.recordingUrl || null,
      task: call.task || null,
      created_at: call.createdAt,
      completed_at: call.completedAt || null,
    });

  } catch (error) {
    console.error("[call/status] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
