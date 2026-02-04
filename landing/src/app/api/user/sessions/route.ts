/**
 * User Sessions API - Option B (Simple)
 * 
 * Fetches sessions directly from OpenClaw via WebSocket RPC.
 * OpenClaw is the single source of truth for conversations.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import WebSocket from "ws";

interface OpenClawSession {
  key: string;
  label?: string;
  displayName?: string;
  updatedAt?: number;
  kind?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface SessionResponse {
  key: string;
  name: string;
  lastActive?: number;
  tokenCount?: number;
}

// WebSocket RPC helper - makes a single request and returns the response
// Handles the OpenClaw connect.challenge handshake
async function gatewayRpc(
  gatewayUrl: string,
  token: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('RPC timeout'));
    }, 10000);
    
    // Build WebSocket URL
    const wsUrl = new URL(gatewayUrl.replace(/^https?/, 'wss'));
    wsUrl.pathname = '/ws';
    wsUrl.searchParams.set('token', token);
    wsUrl.searchParams.set('clientId', 'sessions-api');
    
    const ws = new WebSocket(wsUrl.toString());
    const requestId = `req-${Date.now()}`;
    let connected = false;
    
    const sendConnect = () => {
      ws.send(JSON.stringify({
        type: 'req',
        id: `connect-${Date.now()}`,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client',
            version: '1.0.0',
            platform: 'server',
            mode: 'backend',
          },
          auth: { token },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          caps: [],
        },
      }));
    };
    
    const sendRpc = () => {
      ws.send(JSON.stringify({
        type: 'req',
        id: requestId,
        method,
        params,
      }));
    };
    
    ws.on('open', () => {
      // Wait for challenge before sending anything
    });
    
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        
        // Handle connect.challenge - respond with connect request
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          sendConnect();
          return;
        }
        
        // Handle connect success - now send our RPC request
        if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
          connected = true;
          sendRpc();
          return;
        }
        
        // Handle RPC response
        if (msg.id === requestId) {
          clearTimeout(timeout);
          ws.close();
          if (msg.error) {
            reject(new Error(msg.error.message || 'RPC error'));
          } else {
            // OpenClaw uses 'payload' not 'result' for response data
            resolve(msg.payload);
          }
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    });
    
    ws.on('error', (err: Error) => {
      clearTimeout(timeout);
      ws.close();
      reject(err);
    });
    
    ws.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Look up user's machine
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkId),
    });
    
    if (!userMachine?.appName || !userMachine?.gatewayToken) {
      // No machine yet - return empty (main will be auto-created on first message)
      console.log(`[sessions] No machine for user ${clerkId}`);
      return NextResponse.json({ sessions: [] });
    }
    
    const gatewayUrl = `https://${userMachine.appName}.fly.dev`;
    
    try {
      // Fetch sessions via WebSocket RPC
      const result = await gatewayRpc(gatewayUrl, userMachine.gatewayToken, 'sessions.list', {
        limit: 100,
        includeGlobal: false,
        includeUnknown: false,
      }) as { sessions?: OpenClawSession[] };
      
      const openClawSessions = result?.sessions || [];
      console.log(`[sessions] Fetched ${openClawSessions.length} sessions from OpenClaw`);
      
      // Transform to our format
      const sessions: SessionResponse[] = openClawSessions
        .filter((s: OpenClawSession) => {
          // Filter out internal sessions
          if (!s.key) return false;
          if (s.kind === 'global' || s.kind === 'unknown') return false;
          return true;
        })
        .map((s: OpenClawSession) => {
          // Normalize key for UI (strip agent:main: prefix)
          const normalizedKey = s.key.replace(/^agent:main:/, '');
          
          return {
            key: normalizedKey,
            name: s.label || s.displayName || formatSessionName(normalizedKey),
            lastActive: s.updatedAt,
            tokenCount: s.totalTokens,
          };
        });
      
      // Sort by last active (most recent first)
      sessions.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
      
      return NextResponse.json({ sessions });
      
    } catch (fetchError) {
      console.warn('[sessions] Failed to fetch from gateway:', fetchError);
      // Return empty on error - UI will handle gracefully
      return NextResponse.json({ sessions: [] });
    }
    
  } catch (error) {
    console.error("[sessions] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH - Update session label
export async function PATCH(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body = await request.json();
    const { key, label } = body;
    
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }
    
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkId),
    });
    
    if (!userMachine?.appName || !userMachine?.gatewayToken) {
      return NextResponse.json({ error: "No machine found" }, { status: 404 });
    }
    
    const gatewayUrl = `https://${userMachine.appName}.fly.dev`;
    
    // Canonicalize key for OpenClaw
    const canonicalKey = key.startsWith('agent:main:') ? key : `agent:main:${key}`;
    
    try {
      await gatewayRpc(gatewayUrl, userMachine.gatewayToken, 'sessions.patch', {
        key: canonicalKey,
        label: label || null,
      });
      
      return NextResponse.json({ ok: true });
      
    } catch (rpcError) {
      console.error('[sessions] Failed to patch session:', rpcError);
      return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
    }
    
  } catch (error) {
    console.error("[sessions] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete a session
export async function DELETE(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Support both query params and body
    let key: string | null = null;
    const { searchParams } = new URL(request.url);
    key = searchParams.get('key');
    
    if (!key) {
      try {
        const body = await request.json();
        key = body.key;
      } catch {
        // No body
      }
    }
    
    if (!key) {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }
    
    // Don't allow deleting main session
    if (key === 'main') {
      return NextResponse.json({ error: "Cannot delete main session" }, { status: 400 });
    }
    
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, clerkId),
    });
    
    if (!userMachine?.appName || !userMachine?.gatewayToken) {
      return NextResponse.json({ error: "No machine found" }, { status: 404 });
    }
    
    const gatewayUrl = `https://${userMachine.appName}.fly.dev`;
    const canonicalKey = key.startsWith('agent:main:') ? key : `agent:main:${key}`;
    
    try {
      await gatewayRpc(gatewayUrl, userMachine.gatewayToken, 'sessions.delete', {
        key: canonicalKey,
        deleteTranscript: true,
      });
      
      return NextResponse.json({ ok: true });
      
    } catch (rpcError) {
      console.error('[sessions] Failed to delete session:', rpcError);
      return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }
    
  } catch (error) {
    console.error("[sessions] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
