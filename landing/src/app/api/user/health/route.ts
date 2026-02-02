/**
 * User Gateway Health Check API
 * 
 * Checks if the user's OpenClaw gateway is ready to accept connections.
 * Uses the history endpoint as a health probe (fast, returns quickly).
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json(
        { ready: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // Look up user's machine/app in database
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkId),
    });
    
    if (!userMachine || !userMachine.appName || !userMachine.gatewayToken) {
      return NextResponse.json({
        ready: false,
        error: "Machine not provisioned",
      });
    }
    
    // Build gateway URL - use history endpoint as health probe
    const gatewayBase = `https://${userMachine.appName}.fly.dev`;
    const historyUrl = `${gatewayBase}/ws/api/history?sessionKey=main&token=${encodeURIComponent(userMachine.gatewayToken)}`;
    
    try {
      const response = await fetch(historyUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // Very short timeout - we just want to know if it's responding
        signal: AbortSignal.timeout(2000),
      });
      
      // Any response (including 401, 404) means the gateway is up
      // Only network errors mean it's not ready
      const ready = response.ok || response.status < 500;
      
      return NextResponse.json({
        ready,
        status: response.status,
        appName: userMachine.appName,
      });
    } catch (fetchError) {
      // Network error - gateway not ready
      console.log(`[health] Gateway not ready: ${fetchError instanceof Error ? fetchError.message : 'unknown'}`);
      return NextResponse.json({
        ready: false,
        error: fetchError instanceof Error ? fetchError.message : 'Connection failed',
        appName: userMachine.appName,
      });
    }
  } catch (error) {
    console.error("[health] Error:", error);
    return NextResponse.json(
      { ready: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
