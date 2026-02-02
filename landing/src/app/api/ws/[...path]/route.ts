/**
 * WebSocket API Proxy Route
 * 
 * Proxies HTTP requests to the user's Fly.io gateway's /ws/api/ endpoints.
 * Now looks up the per-user gateway URL from the database.
 * Paths: /api/ws/history, etc.
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  
  try {
    // Get the authenticated user
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json(
        { error: "Unauthorized", messages: [] },
        { status: 401 }
      );
    }
    
    // Look up user's machine/app in database
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkId),
    });
    
    if (!userMachine || !userMachine.appName || !userMachine.gatewayToken) {
      // No machine yet - return empty history
      console.log(`[ws-proxy] No app found for user ${clerkId}`);
      return NextResponse.json({ messages: [] });
    }
    
    // Build target URL for user's gateway
    const gatewayBase = `https://${userMachine.appName}.fly.dev`;
    const targetUrl = new URL(`${gatewayBase}/ws/api/${pathStr}`);
    
    // Add token from database for authentication
    targetUrl.searchParams.set('token', userMachine.gatewayToken);
    
    // Forward other query params (sessionKey, etc.)
    // Canonicalize session key to match how OpenClaw stores sessions
    request.nextUrl.searchParams.forEach((value, key) => {
      // Don't override the token we just set
      if (key !== 'token') {
        if (key === 'sessionKey' && !value.startsWith('agent:main:')) {
          // Convert to canonical form: "test" -> "agent:main:test"
          targetUrl.searchParams.set(key, `agent:main:${value}`);
        } else {
          targetUrl.searchParams.set(key, value);
        }
      }
    });
    
    console.log(`[ws-proxy] Proxying to ${targetUrl.toString()}`);
    
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    // If gateway isn't ready yet (502, 503, etc), return empty history
    if (!response.ok) {
      console.log(`[ws-proxy] Gateway returned ${response.status}, returning empty history`);
      return NextResponse.json({ messages: [] });
    }
    
    const data = await response.text();
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[ws-proxy] Error:", error);
    // Return empty history on error - allows chat to work
    return NextResponse.json({ messages: [] });
  }
}
