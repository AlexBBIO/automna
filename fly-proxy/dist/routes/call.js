/**
 * Voice Call API - Make Outbound Calls, Check Status, Get Usage
 *
 * Proxies outbound calls through Bland.ai with Twilio BYOT.
 * Auth: Gateway token in Authorization header.
 */
import { Hono } from "hono";
import { extractToken, lookupGatewayToken } from "../middleware/auth.js";
import { db } from "../lib/db.js";
import { machines, phoneNumbers, callUsage, PLAN_LIMITS } from "../lib/schema.js";
import { eq, and, gte, desc, sql } from "drizzle-orm";
const BLAND_API_URL = "https://api.bland.ai/v1";
const DEFAULT_VOICE_ID = "6277266e-01eb-44c6-b965-438566ef7076";
const app = new Hono();
// POST / - Initiate outbound call
app.post("/", async (c) => {
    const BLAND_API_KEY = process.env.BLAND_API_KEY;
    const BLAND_BYOT_KEY = process.env.BLAND_BYOT_KEY;
    const token = extractToken(c);
    if (!token)
        return c.json({ error: "Missing authentication" }, 401);
    const auth = await lookupGatewayToken(token);
    if (!auth)
        return c.json({ error: "Invalid gateway token" }, 401);
    const userId = auth.userId;
    const limits = PLAN_LIMITS[auth.plan];
    // Check plan has calling enabled
    if ((limits.monthlyCallMinutes ?? 0) <= 0) {
        return c.json({
            error: "Voice calling not available on your plan",
            upgrade_url: "https://automna.ai/pricing",
        }, 403);
    }
    // Check user has a phone number
    const userPhone = await db.query.phoneNumbers.findFirst({
        where: eq(phoneNumbers.userId, userId),
    });
    if (!userPhone) {
        return c.json({
            error: "No phone number provisioned. Please contact support.",
        }, 400);
    }
    // Check monthly minute limit
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthlyUsage = await db
        .select({ totalSeconds: sql `COALESCE(SUM(${callUsage.durationSeconds}), 0)` })
        .from(callUsage)
        .where(and(eq(callUsage.userId, userId), gte(callUsage.createdAt, startOfMonth)));
    const usedMinutes = Math.ceil((monthlyUsage[0]?.totalSeconds || 0) / 60);
    if (usedMinutes >= limits.monthlyCallMinutes) {
        return c.json({
            error: "Monthly call limit reached",
            used_minutes: usedMinutes,
            limit_minutes: limits.monthlyCallMinutes,
        }, 429);
    }
    // Parse request body
    const body = await c.req.json();
    if (!body.to || !body.task) {
        return c.json({ error: "Missing required fields: to, task" }, 400);
    }
    // Validate phone number format (E.164 - US)
    const cleanNumber = body.to.replace(/[\s\-\(\)]/g, "");
    const e164 = cleanNumber.startsWith("+1") ? cleanNumber :
        cleanNumber.startsWith("1") ? `+${cleanNumber}` :
            `+1${cleanNumber}`;
    if (!e164.match(/^\+1[2-9]\d{9}$/)) {
        return c.json({
            error: "Invalid US phone number. Use format: +12025551234 or (202) 555-1234",
        }, 400);
    }
    // Make Bland API call
    const blandRequest = {
        phone_number: e164,
        from: userPhone.phoneNumber,
        task: body.task,
        first_sentence: body.first_sentence,
        voice: body.voice_id || userPhone.voiceId || DEFAULT_VOICE_ID,
        model: "base",
        language: "en-US",
        max_duration: body.max_duration || 5,
        record: body.record !== false,
        voicemail_action: body.voicemail_action || "hangup",
        voicemail_message: body.voicemail_message,
        webhook: "https://automna-proxy.fly.dev/api/webhooks/bland/status",
        metadata: {
            user_id: userId,
            machine_id: auth.machineId,
            app_name: auth.appName,
            automna: true,
        },
        background_track: null,
        wait_for_greeting: true,
    };
    console.log(`[FLY-PROXY][call] Outbound call for user ${userId}: ${userPhone.phoneNumber} → ${e164}`);
    const blandResponse = await fetch(`${BLAND_API_URL}/calls`, {
        method: "POST",
        headers: {
            "Authorization": BLAND_API_KEY,
            "Content-Type": "application/json",
            "encrypted_key": BLAND_BYOT_KEY,
        },
        body: JSON.stringify(blandRequest),
    });
    if (!blandResponse.ok) {
        const error = await blandResponse.text();
        console.error("[FLY-PROXY][call] Bland API error:", error);
        return c.json({ error: "Failed to initiate call" }, 502);
    }
    const blandData = await blandResponse.json();
    // Log call initiation (lock session key at initiation time for multi-tab safety)
    const machine = await db.query.machines.findFirst({
        where: eq(machines.userId, userId),
    });
    const sessionKey = machine?.lastSessionKey || "main";
    await db.insert(callUsage).values({
        userId,
        blandCallId: blandData.call_id,
        direction: "outbound",
        toNumber: e164,
        fromNumber: userPhone.phoneNumber,
        status: "initiated",
        task: body.task,
        sessionKey,
    });
    return c.json({
        success: true,
        call_id: blandData.call_id,
        from: userPhone.phoneNumber,
        to: e164,
        status: "initiated",
        remaining_minutes: limits.monthlyCallMinutes - usedMinutes,
    });
});
// GET /status - Get call status
app.get("/status", async (c) => {
    const token = extractToken(c);
    if (!token)
        return c.json({ error: "Missing authentication" }, 401);
    const auth = await lookupGatewayToken(token);
    if (!auth)
        return c.json({ error: "Invalid gateway token" }, 401);
    const callId = c.req.query("call_id");
    if (!callId) {
        return c.json({ error: "Missing call_id parameter" }, 400);
    }
    const call = await db.query.callUsage.findFirst({
        where: and(eq(callUsage.blandCallId, callId), eq(callUsage.userId, auth.userId)),
    });
    if (!call) {
        return c.json({ error: "Call not found" }, 404);
    }
    const isComplete = call.status !== "initiated" && call.status !== "ringing";
    return c.json({
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
});
// GET /usage - Get call usage stats and recent calls
app.get("/usage", async (c) => {
    const token = extractToken(c);
    if (!token)
        return c.json({ error: "Missing authentication" }, 401);
    const auth = await lookupGatewayToken(token);
    if (!auth)
        return c.json({ error: "Invalid gateway token" }, 401);
    const userId = auth.userId;
    const limits = PLAN_LIMITS[auth.plan];
    // Get user's phone number
    const userPhone = await db.query.phoneNumbers.findFirst({
        where: eq(phoneNumbers.userId, userId),
    });
    // Calculate monthly usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthlyStats = await db
        .select({
        totalSeconds: sql `COALESCE(SUM(${callUsage.durationSeconds}), 0)`,
        totalCalls: sql `COUNT(*)`,
        totalCostCents: sql `COALESCE(SUM(${callUsage.costCents}), 0)`,
    })
        .from(callUsage)
        .where(and(eq(callUsage.userId, userId), gte(callUsage.createdAt, startOfMonth)));
    const usedMinutes = Math.ceil((monthlyStats[0]?.totalSeconds || 0) / 60);
    // Get recent calls
    const recentCalls = await db
        .select()
        .from(callUsage)
        .where(eq(callUsage.userId, userId))
        .orderBy(desc(callUsage.createdAt))
        .limit(20);
    return c.json({
        phone_number: userPhone?.phoneNumber || null,
        voice_id: userPhone?.voiceId || null,
        agent_name: userPhone?.agentName || null,
        plan: auth.plan,
        usage: {
            used_minutes: usedMinutes,
            limit_minutes: limits.monthlyCallMinutes || 0,
            remaining_minutes: Math.max(0, (limits.monthlyCallMinutes || 0) - usedMinutes),
            total_calls: monthlyStats[0]?.totalCalls || 0,
            total_cost_cents: monthlyStats[0]?.totalCostCents || 0,
        },
        recent_calls: recentCalls.map(call => ({
            id: call.id,
            call_id: call.blandCallId,
            direction: call.direction,
            to: call.toNumber,
            from: call.fromNumber,
            status: call.status,
            duration_seconds: call.durationSeconds,
            summary: call.summary,
            created_at: call.createdAt,
        })),
    });
});
export default app;
