/**
 * Bland.ai Webhook - Call Status Updates
 *
 * Receives call completion events from Bland.
 * 1. Updates call record in database
 * 2. Logs usage event for billing
 * 3. Notifies user's agent session
 */
import { Hono } from "hono";
import { db } from "../lib/db.js";
import { callUsage, machines } from "../lib/schema.js";
import { eq } from "drizzle-orm";
import { logUsageEventBackground } from "../lib/usage-events.js";
import { COSTS } from "../lib/cost-constants.js";
/**
 * Notify user's agent about call completion.
 *
 * Routes notification to the correct conversation session.
 * For outbound calls: uses sessionKey locked at call initiation time (multi-tab safe).
 * For inbound calls: uses machine.lastSessionKey (most recently active conversation).
 *
 * ⚠️ IMPORTANT: Pass bare session key (e.g., "research"), NOT canonical key ("agent:main:research").
 * OpenClaw's buildAgentMainSessionKey() adds the "agent:main:" prefix internally.
 */
async function notifyAgent(appName, gatewayToken, callRecord, lastSessionKey) {
    try {
        const machineUrl = `https://${appName}.fly.dev`;
        const otherNumber = callRecord.direction === "outbound" ? callRecord.toNumber : callRecord.fromNumber;
        const emoji = callRecord.direction === "outbound" ? "📞" : "📲";
        const durationMin = Math.ceil((callRecord.durationSeconds || 0) / 60);
        const message = `${emoji} **Call ${callRecord.direction === "outbound" ? "completed" : "received"}** (${otherNumber}, ${durationMin} min)\n\n**Summary:** ${callRecord.summary || "No summary available."}\n\n**Transcript:**\n${callRecord.transcript || "No transcript available."}`;
        // Resolve session key: outbound uses locked key, inbound uses lastSessionKey
        const targetSessionKey = callRecord.sessionKey || lastSessionKey || "main";
        const agentResponse = await fetch(`${machineUrl}/hooks/agent`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${gatewayToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: `IMPORTANT: A phone call just completed. You MUST relay this information to the user immediately. Do NOT reply with NO_REPLY. Send the following summary to the user:\n\n${message}\n\nRelay this to the user now. Include the summary and key details from the transcript.`,
                name: "PhoneCall",
                deliver: true,
                channel: "last",
                wakeMode: "now",
                sessionKey: targetSessionKey,
            }),
        });
        if (agentResponse.ok) {
            console.log(`[FLY-PROXY][bland-webhook] Agent notified on ${appName} via hooks/agent (session: ${targetSessionKey})`);
        }
        else {
            console.warn(`[FLY-PROXY][bland-webhook] Agent notification failed for ${appName}:`, agentResponse.status, await agentResponse.text());
        }
    }
    catch (err) {
        console.error(`[FLY-PROXY][bland-webhook] Failed to notify agent on ${appName}:`, err);
    }
}
const app = new Hono();
// POST / - Bland webhook handler (no auth required)
app.post("/", async (c) => {
    try {
        const payload = await c.req.json();
        const callId = payload.call_id || payload.c_id;
        console.log(`[FLY-PROXY][bland-webhook] Received webhook for call ${callId}:`, JSON.stringify(payload).slice(0, 500));
        if (!callId) {
            console.warn("[FLY-PROXY][bland-webhook] No call_id in webhook payload");
            return c.json({ ok: true });
        }
        // Look up the call record
        const callRecord = await db.query.callUsage.findFirst({
            where: eq(callUsage.blandCallId, callId),
        });
        if (!callRecord) {
            if (payload.to && payload.metadata?.automna) {
                console.log(`[FLY-PROXY][bland-webhook] Untracked call ${callId}, may be inbound`);
            }
            else {
                console.warn(`[FLY-PROXY][bland-webhook] Unknown call ${callId}`);
            }
            return c.json({ ok: true });
        }
        // Map Bland status
        const transcript = payload.concatenated_transcript || payload.transcript || "";
        const durationSeconds = payload.call_length ? Math.round(payload.call_length * 60) : 0;
        const costCents = Math.ceil((durationSeconds / 60) * 12); // $0.12/min
        const statusMap = {
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
        console.log(`[FLY-PROXY][bland-webhook] Call ${callId} updated: ${finalStatus}, ${durationSeconds}s, $${(costCents / 100).toFixed(2)}`);
        // Log to unified usage_events for Automna Token billing
        const callCostMicrodollars = durationSeconds > 0
            ? Math.round((durationSeconds / 60) * COSTS.CALL_PER_MINUTE)
            : COSTS.CALL_FAILED_ATTEMPT;
        logUsageEventBackground({
            userId: callRecord.userId,
            eventType: "call",
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
        // Find the user's machine for notification
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
            // Notify agent with session routing
            await notifyAgent(machine.appName, machine.gatewayToken, updatedRecord, machine.lastSessionKey);
        }
        return c.json({ ok: true });
    }
    catch (error) {
        console.error("[FLY-PROXY][bland-webhook] Error:", error);
        return c.json({ error: "Webhook processing failed" }, 500);
    }
});
export default app;
