/**
 * Email Send API with Rate Limiting
 * 
 * Proxies email sends through Agentmail with a 50/day limit per user.
 * 
 * Auth: Either Clerk session OR gateway token in Authorization header.
 * This allows both dashboard and agent access.
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, emailSends } from "@/lib/db/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";
import { COSTS } from "@/app/api/_lib/cost-constants";

const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY;
const DAILY_EMAIL_LIMIT = 50;

/**
 * Authenticate request - supports both Clerk and gateway token
 */
async function authenticateRequest(request: NextRequest): Promise<{ userId: string; machine: typeof machines.$inferSelect } | null> {
  // Try Clerk auth first
  const { userId: clerkUserId } = await auth();
  
  if (clerkUserId) {
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkUserId),
    });
    if (userMachine) {
      return { userId: clerkUserId, machine: userMachine };
    }
  }
  
  // Try gateway token auth (for agents)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    
    // Look up machine by gateway token
    const machine = await db.query.machines.findFirst({
      where: eq(machines.gatewayToken, token),
    });
    
    if (machine) {
      return { userId: machine.userId, machine };
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    
    if (!authResult) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, machine: userMachine } = authResult;

    if (!userMachine.agentmailInboxId) {
      return NextResponse.json(
        { error: "Email not configured for this user" },
        { status: 400 }
      );
    }

    // Check rate limit - count emails sent today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUnix = Math.floor(todayStart.getTime() / 1000);

    const countResult = await db
      .select({ count: count() })
      .from(emailSends)
      .where(and(
        eq(emailSends.userId, userId),
        gte(emailSends.sentAt, todayStartUnix)
      ));
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
    const { to, subject, text, html, cc, bcc, attachments } = body;

    if (!to || !subject) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject" },
        { status: 400 }
      );
    }

    // Build request body
    const emailBody: Record<string, unknown> = {
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      text,
      html,
      cc: cc ? (Array.isArray(cc) ? cc.join(", ") : cc) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc.join(", ") : bcc) : undefined,
    };

    // Pass through attachments if provided
    // Format: [{filename, content_type, content (base64), url}]
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      emailBody.attachments = attachments;
      console.log(`[email/send] Sending with ${attachments.length} attachment(s)`);
    }

    // Send via Agentmail
    const agentmailResponse = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(userMachine.agentmailInboxId!)}/messages/send`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${AGENTMAIL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailBody),
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

    // Log to unified usage_events for Automna Credit billing
    logUsageEventBackground({
      userId,
      eventType: 'email',
      costMicrodollars: COSTS.EMAIL_SEND,
      metadata: {
        recipient: Array.isArray(to) ? to[0] : to,
        subject,
        messageId: result.message_id,
      },
    });

    // Record the send
    await db.insert(emailSends).values({
      userId,
      sentAt: Math.floor(Date.now() / 1000),
      recipient: Array.isArray(to) ? to[0] : to,
      subject,
    });

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

    const countResult = await db
      .select({ count: count() })
      .from(emailSends)
      .where(and(
        eq(emailSends.userId, userId),
        gte(emailSends.sentAt, todayStartUnix)
      ));
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
