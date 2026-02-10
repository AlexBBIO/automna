/**
 * Public Stats API (no auth required)
 * Returns tasks this month + active agents for landing page counters
 * Cached for 5 minutes to avoid hammering the DB
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, llmUsage } from "@/lib/db/schema";
import { eq, gte, sql, count } from "drizzle-orm";

let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

    const [tasksResult, machinesResult] = await Promise.all([
      db.select({ count: count() }).from(llmUsage).where(gte(llmUsage.timestamp, monthStartUnix)),
      db.select({ count: count() }).from(machines).where(eq(machines.status, "started")),
    ]);

    const data = {
      tasksMonth: tasksResult[0]?.count ?? 0,
      activeAgents: machinesResult[0]?.count ?? 0,
    };

    cache = { data, ts: Date.now() };

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("[stats] Error:", error);
    return NextResponse.json({ tasksMonth: 0, activeAgents: 0 });
  }
}
