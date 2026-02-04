/**
 * Admin Health API
 * 
 * Returns system health information
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, llmUsage } from "@/lib/db/schema";
import { eq, gte, sql, desc } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId || !isAdmin(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all machines with status
    const allMachines = await db
      .select({
        id: machines.id,
        appName: machines.appName,
        status: machines.status,
        region: machines.region,
        lastActiveAt: machines.lastActiveAt,
        userId: machines.userId,
      })
      .from(machines)
      .orderBy(desc(machines.lastActiveAt));

    // Get recent errors (LLM requests with errors)
    const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const recentErrors = await db
      .select({
        timestamp: llmUsage.timestamp,
        userId: llmUsage.userId,
        model: llmUsage.model,
        error: llmUsage.error,
      })
      .from(llmUsage)
      .where(sql`${llmUsage.error} IS NOT NULL AND ${llmUsage.timestamp} >= ${oneDayAgo}`)
      .orderBy(desc(llmUsage.timestamp))
      .limit(20);

    // Calculate uptime stats
    const machineStats = {
      total: allMachines.length,
      started: allMachines.filter(m => m.status === "started").length,
      stopped: allMachines.filter(m => m.status === "stopped").length,
      other: allMachines.filter(m => !["started", "stopped"].includes(m.status || "")).length,
    };

    // Check external services (basic connectivity)
    const serviceChecks = await Promise.allSettled([
      // Anthropic API check
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": "invalid", "anthropic-version": "2023-06-01" },
      }).then(r => ({ name: "Anthropic", status: r.status === 401 ? "ok" : "error" })),
      
      // Agentmail check
      fetch("https://api.agentmail.to/health", { method: "GET" })
        .then(r => ({ name: "Agentmail", status: r.ok ? "ok" : "error" }))
        .catch(() => ({ name: "Agentmail", status: "error" })),
    ]);

    const services = serviceChecks.map(result => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return { name: "Unknown", status: "error" };
    });

    return NextResponse.json({
      machines: {
        stats: machineStats,
        list: allMachines.map(m => ({
          id: m.id,
          appName: m.appName,
          status: m.status,
          region: m.region,
          lastActiveAt: m.lastActiveAt?.toISOString(),
        })),
      },
      services,
      errors: recentErrors.map(e => ({
        timestamp: new Date(e.timestamp * 1000).toISOString(),
        userId: e.userId,
        model: e.model,
        error: e.error,
      })),
    });

  } catch (error) {
    console.error("[admin/health] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
