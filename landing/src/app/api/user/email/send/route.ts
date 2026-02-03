/**
 * Email Send API with Rate Limiting
 * 
 * Proxies email sends through Agentmail with a 50/day limit per user.
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY;
const DAILY_EMAIL_LIMIT = 50;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's machine (for inbox ID)
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    if (!userMachine?.agentmailInboxId) {
      return NextResponse.json(
        { error: "Email not configured for this user" },
        { status: 400 }
      );
    }

    // Check rate limit - count emails sent today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUnix = Math.floor(todayStart.getTime() / 1000);

    const countResult = await db.all<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM email_sends WHERE user_id = ${userId} AND sent_at >= ${todayStartUnix}`
    );
    const todayCount = countResult[0]?.count || 0;

    if (todayCount >= DAILY_EMAIL_LIMIT) {
      return NextResponse.json(
        { 
          error: "Daily email limit reached",
          limit: DAILY_EMAIL_LIMIT,
          sent: todayCount,
          resetsAt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
        },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { to, subject, text, html, cc, bcc } = body;

    if (!to || !subject) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject" },
        { status: 400 }
      );
    }

    // Send via Agentmail
    const agentmailResponse = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(userMachine.agentmailInboxId)}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${AGENTMAIL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: Array.isArray(to) ? to : [{ email: to }],
          subject,
          text,
          html,
          cc: cc ? (Array.isArray(cc) ? cc : [{ email: cc }]) : undefined,
          bcc: bcc ? (Array.isArray(bcc) ? bcc : [{ email: bcc }]) : undefined,
        }),
      }
    );

    if (!agentmailResponse.ok) {
      const error = await agentmailResponse.text();
      console.error("[email/send] Agentmail error:", error);
      return NextResponse.json(
        { error: "Failed to send email", details: error },
        { status: 500 }
      );
    }

    const result = await agentmailResponse.json();

    // Record the send
    await db.run(
      sql`INSERT INTO email_sends (user_id, sent_at, recipient, subject) VALUES (${userId}, ${Math.floor(Date.now() / 1000)}, ${Array.isArray(to) ? to[0]?.email || to[0] : to}, ${subject})`
    );

    return NextResponse.json({
      success: true,
      messageId: result.message_id,
      remaining: DAILY_EMAIL_LIMIT - todayCount - 1,
    });

  } catch (error) {
    console.error("[email/send] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Check remaining quota
export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUnix = Math.floor(todayStart.getTime() / 1000);

    const countResult = await db.all<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM email_sends WHERE user_id = ${userId} AND sent_at >= ${todayStartUnix}`
    );
    const todayCount = countResult[0]?.count || 0;

    return NextResponse.json({
      limit: DAILY_EMAIL_LIMIT,
      sent: todayCount,
      remaining: Math.max(0, DAILY_EMAIL_LIMIT - todayCount),
      resetsAt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
    });

  } catch (error) {
    console.error("[email/send] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
