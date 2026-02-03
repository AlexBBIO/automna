/**
 * Files API - Base route
 * Handles DELETE at /api/files?path=...
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function getUserGateway(clerkId: string) {
  const userMachine = await db.query.machines.findFirst({
    where: eq(machines.userId, clerkId),
  });
  
  if (!userMachine || !userMachine.appName || !userMachine.gatewayToken) {
    return null;
  }
  
  return {
    appName: userMachine.appName,
    machineId: userMachine.id,
    token: userMachine.gatewayToken,
  };
}

function getFileServerUrl(appName: string, endpoint: string, token: string, params?: Record<string, string>) {
  const url = new URL(`https://${appName}.fly.dev/files${endpoint}`);
  url.searchParams.set('token', token);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return url.toString();
}

export async function DELETE(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const gateway = await getUserGateway(clerkId);
    if (!gateway) {
      return NextResponse.json({ error: 'No gateway configured' }, { status: 404 });
    }
    
    if (!filePath) {
      return NextResponse.json({ error: 'Path required' }, { status: 400 });
    }
    
    const fileServerUrl = getFileServerUrl(
      gateway.appName,
      '/delete',
      gateway.token,
      { path: filePath }
    );
    
    console.log(`[files] DELETE ${filePath}`);
    
    const response = await fetch(fileServerUrl, {
      method: 'DELETE',
      signal: AbortSignal.timeout(30000),
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
    
  } catch (error) {
    console.error('[files] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
