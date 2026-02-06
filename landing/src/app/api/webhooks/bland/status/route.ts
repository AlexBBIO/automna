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
 * Format transcript as readable markdown
 */
function formatTranscript(raw: string): string {
  if (!raw) return "";
  return raw
    .split("\n")
    .map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith("user:")) return `**Caller:** ${trimmed.slice(5).trim()}`;
      if (trimmed.startsWith("assistant:")) return `**Agent:** ${trimmed.slice(10).trim()}`;
      if (trimmed.startsWith("agent-action:")) return `*[${trimmed.slice(13).trim()}]*`;
      return trimmed;
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Write transcript file to user's Fly machine
 */
async function writeTranscriptToMachine(
  appName: string,
  gatewayToken: string,
  callRecord: {
    direction: string;
    toNumber: string;
    fromNumber: string;
    summary: string;
    transcript: string;
    durationSeconds: number;
    status: string;
    task?: string | null;
    createdAt: Date | null;
  }
) {
  const now = callRecord.createdAt || new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().slice(11, 16).replace(":", ""); // HHMM
  const otherNumber = callRecord.direction === "outbound" ? callRecord.toNumber : callRecord.fromNumber;
  const sanitizedNumber = otherNumber.replace(/[^0-9+]/g, "");
  const filename = `${dateStr}_${timeStr}_${callRecord.direction}_${sanitizedNumber}.md`;

  const content = `# Call: ${callRecord.summary?.split(".")[0] || callRecord.direction + " call"}
**Date:** ${now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
**Direction:** ${callRecord.direction === "outbound" ? "📞 Outbound" : "📲 Inbound"}
**${callRecord.direction === "outbound" ? "To" : "From"}:** ${otherNumber}
**${callRecord.direction === "outbound" ? "From" : "To"}:** ${callRecord.direction === "outbound" ? callRecord.fromNumber : callRecord.toNumber}
**Duration:** ${Math.ceil((callRecord.durationSeconds || 0) / 60)} min ${(callRecord.durationSeconds || 0) % 60}s
**Status:** ${callRecord.status}
${callRecord.task ? `\n**Task:** ${callRecord.task}\n` : ""}
## Summary
${callRecord.summary || "No summary available."}

## Transcript
${formatTranscript(callRecord.transcript)}
`;

  try {
    // Write via the OpenClaw file API on the user's machine
    const machineUrl = `https://${appName}.fly.dev`;

    // Use the gateway REST API to send a chat message that writes the file
    // The agent will save it - but we also try direct file write via exec endpoint
    const writeCommand = `mkdir -p /home/node/.openclaw/calls && cat > /home/node/.openclaw/calls/${filename} << 'TRANSCRIPT_EOF'\n${content}\nTRANSCRIPT_EOF`;

    // Try gateway exec endpoint
    const execResponse = await fetch(`${machineUrl}/api/v1/exec`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command: writeCommand,
        timeout: 5000,
      }),
    });

    if (execResponse.ok) {
      console.log(`[bland-webhook] Transcript written to ${appName}:/home/node/.openclaw/calls/${filename}`);
      return filename;
    } else {
      console.warn(`[bland-webhook] Exec write failed for ${appName}:`, await execResponse.text());
    }
  } catch (err) {
    console.error(`[bland-webhook] Failed to write transcript to ${appName}:`, err);
  }

  return filename; // Return filename even if write failed (for notification)
}

/**
 * Notify user's agent about call completion
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
  },
  filename: string
) {
  try {
    const machineUrl = `https://${appName}.fly.dev`;
    const otherNumber = callRecord.direction === "outbound" ? callRecord.toNumber : callRecord.fromNumber;
    const emoji = callRecord.direction === "outbound" ? "📞" : "📲";
    const durationMin = Math.ceil((callRecord.durationSeconds || 0) / 60);

    const message = `${emoji} **Call ${callRecord.direction === "outbound" ? "completed" : "received"}** (${otherNumber}, ${durationMin} min)

**Summary:** ${callRecord.summary || "No summary available."}

Transcript saved to \`calls/${filename}\``;

    // Send as a system event / chat message to the agent
    const chatResponse = await fetch(`${machineUrl}/api/v1/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${gatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        sessionKey: "agent:main",
      }),
    });

    if (chatResponse.ok) {
      console.log(`[bland-webhook] Agent notified on ${appName}`);
    } else {
      console.warn(`[bland-webhook] Agent notification failed for ${appName}:`, await chatResponse.text());
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
      };

      // Write transcript file and notify agent (parallel)
      const filename = await writeTranscriptToMachine(
        machine.appName,
        machine.gatewayToken,
        updatedRecord
      );

      await notifyAgent(
        machine.appName,
        machine.gatewayToken,
        updatedRecord,
        filename
      );
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[bland-webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
