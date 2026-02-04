/**
 * Admin - Delete User Machine
 * 
 * Completely removes a user's infrastructure:
 * - Destroys Fly machine and app
 * - Deletes Browserbase context
 * - Deletes Agentmail inbox
 * - Removes from machines table
 * 
 * Does NOT delete:
 * - users table (Clerk is source of truth)
 * - llm_usage table (billing history)
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, machineEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY?.replace(/[\r\n]+$/, "");
const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY?.replace(/[\r\n]+$/, "");

interface DeleteResult {
  step: string;
  success: boolean;
  error?: string;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId || !isAdmin(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: targetUserId } = await params;
  const results: DeleteResult[] = [];

  try {
    // Get machine info
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, targetUserId),
    });

    if (!machine) {
      return NextResponse.json({ error: "No machine found for user" }, { status: 404 });
    }

    // 1. Stop Fly machine (if running)
    if (machine.id && machine.appName) {
      try {
        const stopRes = await fetch(
          `https://api.machines.dev/v1/apps/${machine.appName}/machines/${machine.id}/stop`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
          }
        );
        results.push({ step: "stop_machine", success: stopRes.ok });
      } catch (e) {
        results.push({ step: "stop_machine", success: false, error: String(e) });
      }
    }

    // 2. Destroy Fly machine
    if (machine.id && machine.appName) {
      try {
        const destroyRes = await fetch(
          `https://api.machines.dev/v1/apps/${machine.appName}/machines/${machine.id}?force=true`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
          }
        );
        results.push({ step: "destroy_machine", success: destroyRes.ok });
      } catch (e) {
        results.push({ step: "destroy_machine", success: false, error: String(e) });
      }
    }

    // 3. Destroy Fly app (also deletes volumes)
    if (machine.appName) {
      try {
        // Use GraphQL API to delete app
        const deleteAppRes = await fetch("https://api.fly.io/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FLY_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `mutation($appId: ID!) { deleteApp(appId: $appId) { organization { id } } }`,
            variables: { appId: machine.appName },
          }),
        });
        const deleteAppData = await deleteAppRes.json();
        results.push({ 
          step: "destroy_app", 
          success: !deleteAppData.errors,
          error: deleteAppData.errors?.[0]?.message 
        });
      } catch (e) {
        results.push({ step: "destroy_app", success: false, error: String(e) });
      }
    }

    // 4. Delete Browserbase context
    if (machine.browserbaseContextId && BROWSERBASE_API_KEY) {
      try {
        const bbRes = await fetch(
          `https://api.browserbase.com/v1/contexts/${machine.browserbaseContextId}`,
          {
            method: "DELETE",
            headers: { "X-BB-API-Key": BROWSERBASE_API_KEY },
          }
        );
        results.push({ step: "delete_browserbase", success: bbRes.ok });
      } catch (e) {
        results.push({ step: "delete_browserbase", success: false, error: String(e) });
      }
    } else {
      results.push({ step: "delete_browserbase", success: true, error: "No context to delete" });
    }

    // 5. Delete Agentmail inbox
    if (machine.agentmailInboxId && AGENTMAIL_API_KEY) {
      try {
        const amRes = await fetch(
          `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(machine.agentmailInboxId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${AGENTMAIL_API_KEY}` },
          }
        );
        results.push({ step: "delete_agentmail", success: amRes.ok });
      } catch (e) {
        results.push({ step: "delete_agentmail", success: false, error: String(e) });
      }
    } else {
      results.push({ step: "delete_agentmail", success: true, error: "No inbox to delete" });
    }

    // 6. Delete machine events first (foreign key constraint)
    try {
      await db.delete(machineEvents).where(eq(machineEvents.machineId, machine.id));
      results.push({ step: "delete_events", success: true });
    } catch (e) {
      results.push({ step: "delete_events", success: false, error: String(e) });
    }

    // 7. Delete from machines table
    try {
      await db.delete(machines).where(eq(machines.id, machine.id));
      results.push({ step: "delete_db_record", success: true });
    } catch (e) {
      results.push({ step: "delete_db_record", success: false, error: String(e) });
    }

    const allSuccess = results.every(r => r.success);

    return NextResponse.json({
      success: allSuccess,
      message: allSuccess ? "User machine deleted successfully" : "Partial deletion - some steps failed",
      results,
      deletedUser: targetUserId,
      deletedMachine: machine.id,
      deletedApp: machine.appName,
    });

  } catch (error) {
    console.error("[admin/delete] Error:", error);
    return NextResponse.json(
      { error: "Deletion failed", details: String(error), results },
      { status: 500 }
    );
  }
}
