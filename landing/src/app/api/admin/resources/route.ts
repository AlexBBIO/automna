/**
 * Admin Resources API
 * 
 * Fetches live resource usage (CPU, memory) for all running machines via Fly API.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";

const FLY_API_TOKEN = process.env.FLY_API_TOKEN!;

interface MachineResource {
  appName: string;
  machineId: string;
  userName: string | null;
  plan: string;
  status: string;
  config: {
    cpus: number;
    memoryMb: number;
  } | null;
  metrics: {
    memoryUsedMb: number | null;
    memoryLimitMb: number | null;
    memoryPercent: number | null;
    uptimeSeconds: number | null;
    restartCount: number | null;
  } | null;
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId || !isAdmin(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all machines with user info
    const allMachines = await db
      .select({
        id: machines.id,
        appName: machines.appName,
        status: machines.status,
        userId: machines.userId,
        plan: machines.plan,
      })
      .from(machines);

    // Get user names
    const userIds = [...new Set(allMachines.map(m => m.userId))];
    const userNames: Record<string, string> = {};
    if (userIds.length > 0) {
      const allUsers = await db
        .select({ id: users.id, name: users.name })
        .from(users);
      for (const u of allUsers) {
        if (u.name) userNames[u.id] = u.name;
      }
    }

    // Fetch Fly machine details in parallel for running machines
    const runningMachines = allMachines.filter(m => m.status === "started");
    
    const results: MachineResource[] = await Promise.all(
      runningMachines.map(async (m) => {
        const base: MachineResource = {
          appName: m.appName || "unknown",
          machineId: m.id,
          userName: userNames[m.userId] || null,
          plan: m.plan || "starter",
          status: m.status || "unknown",
          config: null,
          metrics: null,
        };

        try {
          // Get machine details from Fly (includes config with resource limits)
          const machineRes = await fetch(
            `https://api.machines.dev/v1/apps/${m.appName}/machines/${m.id}`,
            {
              headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
              signal: AbortSignal.timeout(5000),
            }
          );

          if (!machineRes.ok) return base;
          const machineData = await machineRes.json();

          const guest = machineData.config?.guest;
          base.config = {
            cpus: guest?.cpus || 0,
            memoryMb: guest?.memory_mb || 0,
          };

          // Calculate uptime from created_at and events
          const events = machineData.events || [];
          const lastStart = events.find((e: { type: string }) => e.type === "start");
          const uptimeSeconds = lastStart
            ? Math.floor((Date.now() - lastStart.timestamp) / 1000)
            : null;
          const restartCount = events.filter((e: { type: string }) => e.type === "start").length;

          base.metrics = {
            memoryUsedMb: null,
            memoryLimitMb: guest?.memory_mb || null,
            memoryPercent: null,
            uptimeSeconds,
            restartCount: restartCount > 0 ? restartCount - 1 : 0, // First start isn't a restart
          };

          // Get memory usage via Fly exec API (reads /proc/meminfo)
          try {
            const execRes = await fetch(
              `https://api.machines.dev/v1/apps/${m.appName}/machines/${m.id}/exec`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${FLY_API_TOKEN}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  command: ["cat", "/proc/meminfo"],
                  timeout: 3,
                }),
                signal: AbortSignal.timeout(5000),
              }
            );

            if (execRes.ok) {
              const execData = await execRes.json();
              const stdout = execData.stdout || "";
              // Parse MemTotal and MemAvailable from /proc/meminfo output
              const totalMatch = stdout.match(/MemTotal:\s+(\d+)/);
              const availMatch = stdout.match(/MemAvailable:\s+(\d+)/);
              if (totalMatch && availMatch) {
                const totalKb = parseInt(totalMatch[1]);
                const availKb = parseInt(availMatch[1]);
                const usedKb = totalKb - availKb;
                base.metrics!.memoryUsedMb = Math.round(usedKb / 1024);
                base.metrics!.memoryLimitMb = Math.round(totalKb / 1024);
                base.metrics!.memoryPercent = Math.round((usedKb / totalKb) * 100);
              }
            }
          } catch {
            // Exec not available, that's fine
          }

        } catch {
          // Machine unreachable
        }

        return base;
      })
    );

    // Also include stopped machines
    const stoppedMachines = allMachines
      .filter(m => m.status !== "started")
      .map(m => ({
        appName: m.appName || "unknown",
        machineId: m.id,
        userName: userNames[m.userId] || null,
        plan: m.plan || "starter",
        status: m.status || "unknown",
        config: null,
        metrics: null,
      }));

    return NextResponse.json({
      machines: [...results, ...stoppedMachines],
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[admin/resources] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
