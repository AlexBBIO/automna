/**
 * Voice Call API - Make Outbound Calls
 * 
 * Proxies outbound calls through Bland.ai with Twilio BYOT.
 * Auth: Gateway token in Authorization header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, phoneNumbers, callUsage, PLAN_LIMITS } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

const BLAND_API_KEY = process.env.BLAND_API_KEY!;
const BLAND_BYOT_KEY = process.env.BLAND_BYOT_KEY!;
const BLAND_API_URL = "https://api.bland.ai/v1";

// Default voice: Alexandra
const DEFAULT_VOICE_ID = "6277266e-01eb-44c6-b965-438566ef7076";

interface CallRequest {
  to: string;
  task: string;
  first_sentence?: string;
  voice_id?: string;
  max_duration?: number;
  record?: boolean;
  voicemail_action?: "hangup" | "leave_message" | "ignore";
  voicemail_message?: string;
}

export async function POST(req: NextRequest) {
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

    const userId = machine.userId;
    const plan = (machine.plan || "starter") as keyof typeof PLAN_LIMITS;

    // 2. Check plan has calling enabled
    const limits = PLAN_LIMITS[plan];
    if ((limits.monthlyCallMinutes ?? 0) <= 0) {
      return NextResponse.json({
        error: "Voice calling not available on your plan",
        upgrade_url: "https://automna.ai/pricing"
      }, { status: 403 });
    }

    // 3. Check user has a phone number
    const userPhone = await db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.userId, userId),
    });

    if (!userPhone) {
      return NextResponse.json({
        error: "No phone number provisioned. Please contact support."
      }, { status: 400 });
    }

    // 4. Check monthly minute limit
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await db
      .select({ totalSeconds: sql<number>`COALESCE(SUM(${callUsage.durationSeconds}), 0)` })
      .from(callUsage)
      .where(and(
        eq(callUsage.userId, userId),
        gte(callUsage.createdAt, startOfMonth)
      ));

    const usedMinutes = Math.ceil((monthlyUsage[0]?.totalSeconds || 0) / 60);

    if (usedMinutes >= limits.monthlyCallMinutes) {
      return NextResponse.json({
        error: "Monthly call limit reached",
        used_minutes: usedMinutes,
        limit_minutes: limits.monthlyCallMinutes,
      }, { status: 429 });
    }

    // 5. Parse request
    const body: CallRequest = await req.json();

    if (!body.to || !body.task) {
      return NextResponse.json({
        error: "Missing required fields: to, task"
      }, { status: 400 });
    }

    // Validate phone number format (E.164 - US)
    const cleanNumber = body.to.replace(/[\s\-\(\)]/g, "");
    const e164 = cleanNumber.startsWith("+1") ? cleanNumber :
                 cleanNumber.startsWith("1") ? `+${cleanNumber}` :
                 `+1${cleanNumber}`;

    if (!e164.match(/^\+1[2-9]\d{9}$/)) {
      return NextResponse.json({
        error: "Invalid US phone number. Use format: +12025551234 or (202) 555-1234"
      }, { status: 400 });
    }

    // 6. Make Bland API call
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
      webhook: `${process.env.NEXT_PUBLIC_APP_URL || "https://automna.ai"}/api/webhooks/bland/status`,
      metadata: {
        user_id: userId,
        machine_id: machine.id,
        app_name: machine.appName,
        automna: true,
      },
      background_track: null,
      wait_for_greeting: true,
    };

    console.log(`[call] Outbound call for user ${userId}: ${userPhone.phoneNumber} → ${e164}`);

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
      console.error("[call] Bland API error:", error);
      return NextResponse.json({
        error: "Failed to initiate call"
      }, { status: 502 });
    }

    const blandData = await blandResponse.json();

    // 7. Log call initiation (lock session key at initiation time for multi-tab safety)
    const sessionKey = machine.lastSessionKey || 'main';
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

    // 8. Return success
    return NextResponse.json({
      success: true,
      call_id: blandData.call_id,
      from: userPhone.phoneNumber,
      to: e164,
      status: "initiated",
      remaining_minutes: limits.monthlyCallMinutes - usedMinutes,
    });

  } catch (error) {
    console.error("[call] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
