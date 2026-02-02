/**
 * User Sessions API
 * 
 * Fetches the list of active sessions from the user's OpenClaw gateway.
 * This allows the UI to show conversations that actually exist on the gateway.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface Session {
  key: string;
  name?: string;
  lastActive?: string;
  messageCount?: number;
}

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // Look up user's machine/app in database
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkId),
    });
    
    if (!userMachine || !userMachine.appName || !userMachine.gatewayToken) {
      // No machine yet - return default session only
      return NextResponse.json({
        sessions: [{ key: 'main', name: 'General' }],
      });
    }
    
    // Build gateway URL
    const gatewayBase = `https://${userMachine.appName}.fly.dev`;
    const sessionsUrl = `${gatewayBase}/api/sessions?token=${encodeURIComponent(userMachine.gatewayToken)}`;
    
    try {
      const response = await fetch(sessionsUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // Short timeout - if gateway isn't ready, just return defaults
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        console.log(`[sessions] Gateway returned ${response.status}, using defaults`);
        return NextResponse.json({
          sessions: [{ key: 'main', name: 'General' }],
        });
      }
      
      const data = await response.json();
      
      // Gateway returns sessions array
      // Filter to only sessions that have messages (active conversations)
      // Normalize keys: "agent:main:work" -> "work" for UI consistency
      const sessions: Session[] = (data.sessions || [])
        .filter((s: Session) => s.key && (s.messageCount ?? 0) > 0)
        .map((s: Session) => {
          // Strip canonical prefix for UI display
          const normalizedKey = s.key.replace(/^agent:main:/, '');
          return {
            key: normalizedKey,
            name: s.name || formatSessionName(normalizedKey),
            lastActive: s.lastActive,
            messageCount: s.messageCount,
          };
        });
      
      // Dedupe in case both "main" and "agent:main:main" exist
      const seenKeys = new Set<string>();
      const dedupedSessions = sessions.filter(s => {
        if (seenKeys.has(s.key)) return false;
        seenKeys.add(s.key);
        return true;
      });
      
      // Always include 'main' session even if empty
      if (!dedupedSessions.some(s => s.key === 'main')) {
        dedupedSessions.unshift({ key: 'main', name: 'General' });
      }
      
      return NextResponse.json({ sessions: dedupedSessions });
    } catch (fetchError) {
      console.warn('[sessions] Failed to fetch from gateway:', fetchError);
      // Return defaults on error
      return NextResponse.json({
        sessions: [{ key: 'main', name: 'General' }],
      });
    }
  } catch (error) {
    console.error("[sessions] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Format session key into readable name
function formatSessionName(key: string): string {
  if (key === 'main') return 'General';
  // Convert kebab-case or snake_case to Title Case
  return key
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
