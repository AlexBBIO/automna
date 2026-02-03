/**
 * Email Inbox API
 * 
 * Proxies inbox reading through Agentmail. No rate limit needed for reading.
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY;

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
    
    const machine = await db.query.machines.findFirst({
      where: eq(machines.gatewayToken, token),
    });
    
    if (machine) {
      return { userId: machine.userId, machine };
    }
  }
  
  return null;
}

// GET: List messages in inbox
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    
    if (!authResult) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { machine: userMachine } = authResult;

    if (!userMachine.agentmailInboxId) {
      return NextResponse.json(
        { error: "Email not configured for this user" },
        { status: 400 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "20";
    const offset = searchParams.get("offset") || "0";

    // Fetch from Agentmail
    const response = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(userMachine.agentmailInboxId)}/messages?limit=${limit}&offset=${offset}`,
      {
        headers: {
          "Authorization": `Bearer ${AGENTMAIL_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[email/inbox] Agentmail error:", error);
      return NextResponse.json(
        { error: "Failed to fetch inbox", details: error },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("[email/inbox] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
