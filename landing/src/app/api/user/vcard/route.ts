/**
 * Generate a vCard (.vcf) file for the user's AI agent
 * Opens natively in phone/email contacts apps
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, phoneNumbers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's phone number and agent email
    const [userPhone, userMachine] = await Promise.all([
      db.query.phoneNumbers.findFirst({
        where: eq(phoneNumbers.userId, userId),
      }),
      db.query.machines.findFirst({
        where: eq(machines.userId, userId),
      }),
    ]);

    if (!userPhone && !userMachine?.agentmailInboxId) {
      return NextResponse.json(
        { error: "No agent contact info found" },
        { status: 404 }
      );
    }

    const agentName = userPhone?.agentName || "Automna Agent";
    const phone = userPhone?.phoneNumber || "";
    const email = userMachine?.agentmailInboxId || "";

    // Build vCard 3.0
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${agentName}`,
      `N:;${agentName};;;`,
      `ORG:Automna`,
      phone ? `TEL;TYPE=CELL:${phone}` : "",
      email ? `EMAIL;TYPE=INTERNET:${email}` : "",
      `URL:https://automna.ai/dashboard`,
      "END:VCARD",
    ]
      .filter(Boolean)
      .join("\r\n");

    return new NextResponse(vcard, {
      status: 200,
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${agentName.replace(/[^a-zA-Z0-9]/g, '_')}.vcf"`,
      },
    });
  } catch (error) {
    console.error("[vcard] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate vCard" },
      { status: 500 }
    );
  }
}
