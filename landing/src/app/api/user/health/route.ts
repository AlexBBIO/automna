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
    
    // Build gateway URL - just check if it responds
    const gatewayBase = `https://${userMachine.appName}.fly.dev`;
    
    try {
      // Simple health check - any response means the server is up
      const response = await fetch(gatewayBase, {
        method: "HEAD", // Just check if reachable
        signal: AbortSignal.timeout(5000),
      });
      
      // Any response means the gateway is up (even redirects, 404s, etc.)
      // Only network errors mean it's not ready
      const ready = response.status > 0;
      
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
