/**
 * Bland.ai Webhook - Call Status Updates
 * 
 * Receives call completion events from Bland.
 * 1. Updates call record in database
 * 2. Writes transcript file to user's Fly volume
 * 3. Notifies user's agent session
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callUsage, machines, phoneNumbers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";
import { COSTS } from "@/app/api/_lib/cost-constants";

interface BlandWebhookPayload {
  call_id: string;
  c_id?: string; // alternate call ID field
  status?: string;
  completed?: boolean;
  call_length?: number;
  concatenated_transcript?: string;
  transcript?: string;
  recording_url?: string;
  summary?: string;
  error_message?: string;
  to?: string;
  from?: string;
  metadata?: {
    user_id?: string;
    machine_id?: string;
    app_name?: string;
    automna?: boolean;
  };
  // Inbound calls have different fields
  inbound?: boolean;
  variables?: Record<string, unknown>;
}

/**
 * Notify user's agent about call completion
 * 
 * Routes notification to the correct conversation session.
 * For outbound calls: uses sessionKey locked at call initiation time (multi-tab safe).
 * For inbound calls: uses machine.lastSessionKey (most recently active conversation).
 * 
 * ⚠️ IMPORTANT: Pass bare session key (e.g., "research"), NOT canonical key ("agent:main:research").
 * OpenClaw's buildAgentMainSessionKey() adds the "agent:main:" prefix internally.
 */
async function notifyAgent(
  appName: string,
  gatewayToken: string,
  callRecord: {
    direction: string;
    toNumber: string;
    fromNumber: string;
    summary: string;
    transcript: string;
    durationSeconds: number;
    task?: string | null;
    sessionKey?: string | null;
  },
  lastSessionKey: string | null,
) {
  try {
    const machineUrl = `https://${appName}.fly.dev`;
    const otherNumber = callRecord.direction === "outbound" ? callRecord.toNumber : callRecord.fromNumber;
    const emoji = callRecord.direction === "outbound" ? "📞" : "📲";
    const durationMin = Math.ceil((callRecord.durationSeconds || 0) / 60);

    const message = `${emoji} **Call ${callRecord.direction === "outbound" ? "completed" : "received"}** (${otherNumber}, ${durationMin} min)

**Summary:** ${callRecord.summary || "No summary available."}

**Transcript:**
${callRecord.transcript || "No transcript available."}`;

    // Resolve session key: outbound uses locked key, inbound uses lastSessionKey
    const targetSessionKey = callRecord.sessionKey || lastSessionKey || 'main';

    // Send via hooks/agent - runs an agent turn that delivers the response to the user
    const agentResponse = await fetch(`${machineUrl}/hooks/agent`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `A phone call just completed. Here are the results:\n\n${message}\n\nPlease inform the user about this call result. Keep it concise. Save the transcript to a file in the calls/ directory.`,
        name: "PhoneCall",
        deliver: true,
        channel: "last",
        wakeMode: "now",
        // ⚠️ Bare key only! OpenClaw adds "agent:main:" prefix via buildAgentMainSessionKey()
        sessionKey: targetSessionKey,
      }),
    });

    if (agentResponse.ok) {
      console.log(`[bland-webhook] Agent notified on ${appName} via hooks/agent (session: ${targetSessionKey})`);
    } else {
      console.warn(`[bland-webhook] Agent notification failed for ${appName}:`, agentResponse.status, await agentResponse.text());
    }
  } catch (err) {
    console.error(`[bland-webhook] Failed to notify agent on ${appName}:`, err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload: BlandWebhookPayload = await req.json();
    const callId = payload.call_id || payload.c_id;

    console.log(`[bland-webhook] Received webhook for call ${callId}:`, JSON.stringify(payload).slice(0, 500));

    if (!callId) {
      console.warn("[bland-webhook] No call_id in webhook payload");
      return NextResponse.json({ ok: true });
    }

    // Look up the call record
    const callRecord = await db.query.callUsage.findFirst({
      where: eq(callUsage.blandCallId, callId),
    });

    if (!callRecord) {
      // Might be an inbound call we haven't tracked yet
      // Check if it's from one of our numbers
      if (payload.to && payload.metadata?.automna) {
        console.log(`[bland-webhook] Untracked call ${callId}, may be inbound`);
      } else {
        console.warn(`[bland-webhook] Unknown call ${callId}`);
      }
      return NextResponse.json({ ok: true });
    }

    // Map Bland status
    const transcript = payload.concatenated_transcript || payload.transcript || "";
    const durationSeconds = payload.call_length ? Math.round(payload.call_length * 60) : 0; // Bland returns minutes
    const costCents = Math.ceil((durationSeconds / 60) * 12); // $0.12/min

    const statusMap: Record<string, string> = {
      "completed": "completed",
      "failed": "failed",
      "no-answer": "no_answer",
      "voicemail": "voicemail",
    };

    const finalStatus = payload.status ? (statusMap[payload.status] || payload.status) : 
                        payload.completed ? "completed" : "failed";

    // Update call record in database
    await db.update(callUsage)
      .set({
        status: finalStatus,
        durationSeconds,
        transcript,
        summary: payload.summary || null,
        recordingUrl: payload.recording_url || null,
        costCents,
        completedAt: new Date(),
      })
      .where(eq(callUsage.blandCallId, callId));

    console.log(`[bland-webhook] Call ${callId} updated: ${finalStatus}, ${durationSeconds}s, $${(costCents / 100).toFixed(2)}`);

    // Log to unified usage_events for Automna Token billing
    const callCostMicrodollars = durationSeconds > 0
      ? Math.round((durationSeconds / 60) * COSTS.CALL_PER_MINUTE)
      : COSTS.CALL_FAILED_ATTEMPT;
    logUsageEventBackground({
      userId: callRecord.userId,
      eventType: 'call',
      costMicrodollars: callCostMicrodollars,
      metadata: {
        blandCallId: callId,
        direction: callRecord.direction,
        toNumber: callRecord.toNumber,
        fromNumber: callRecord.fromNumber,
        durationSeconds,
        status: finalStatus,
      },
    });

    // Find the user's machine for file write + notification
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, callRecord.userId),
    });

    if (machine?.appName && machine?.gatewayToken) {
      const updatedRecord = {
        direction: callRecord.direction,
        toNumber: callRecord.toNumber,
        fromNumber: callRecord.fromNumber,
        summary: payload.summary || "",
        transcript,
        durationSeconds,
        status: finalStatus,
        task: callRecord.task,
        createdAt: callRecord.createdAt,
        sessionKey: callRecord.sessionKey,
      };

      // Notify agent with session routing (transcript included in message for agent to save)
      await notifyAgent(
        machine.appName,
        machine.gatewayToken,
        updatedRecord,
        machine.lastSessionKey,
      );
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[bland-webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
