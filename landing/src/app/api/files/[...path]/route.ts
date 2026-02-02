/**
 * Files API Routes
 * 
 * Proxies file operations to the user's Fly machine file server (port 8080).
 * 
 * Endpoints:
 * - GET /api/files/list?path=/home/node/.openclaw/workspace - List directory
 * - GET /api/files/read?path=/home/node/.openclaw/workspace/file.md - Read file
 * - POST /api/files/write - Write file { path, content }
 * - POST /api/files/mkdir - Create directory { path }
 * - POST /api/files/move - Move file { from, to }
 * - POST /api/files/upload - Upload file (multipart)
 * - DELETE /api/files?path=... - Delete file
 * - GET /api/files/download?path=... - Download file
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const FILE_SERVER_PORT = 8080;

// ============================================
// UTILITIES
// ============================================

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
  const url = new URL(`http://${appName}.fly.dev:${FILE_SERVER_PORT}${endpoint}`);
  url.searchParams.set('token', token);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return url.toString();
}

// ============================================
// GET HANDLERS
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const operation = pathSegments[0];
  const filePath = request.nextUrl.searchParams.get('path') || '/home/node/.openclaw/workspace';
  
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const gateway = await getUserGateway(clerkId);
    if (!gateway) {
      return NextResponse.json({ error: 'No gateway configured' }, { status: 404 });
    }
    
    const fileServerUrl = getFileServerUrl(
      gateway.appName,
      `/${operation}`,
      gateway.token,
      { path: filePath }
    );
    
    console.log(`[files] ${operation.toUpperCase()} ${filePath}`);
    
    const response = await fetch(fileServerUrl, {
      signal: AbortSignal.timeout(30000),
    });
    
    // For downloads, stream the response
    if (operation === 'download') {
      if (!response.ok) {
        const error = await response.json();
        return NextResponse.json(error, { status: response.status });
      }
      
      return new NextResponse(response.body, {
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment',
          'Content-Length': response.headers.get('Content-Length') || '',
        },
      });
    }
    
    // For JSON responses
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
    
  } catch (error) {
    console.error('[files] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// POST HANDLERS
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const operation = pathSegments[0];
  
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const gateway = await getUserGateway(clerkId);
    if (!gateway) {
      return NextResponse.json({ error: 'No gateway configured' }, { status: 404 });
    }
    
    switch (operation) {
      case 'write': {
        const body = await request.json();
        const { path: filePath, content } = body;
        
        if (!filePath) {
          return NextResponse.json({ error: 'Path required' }, { status: 400 });
        }
        
        const fileServerUrl = getFileServerUrl(
          gateway.appName,
          '/write',
          gateway.token,
          { path: filePath }
        );
        
        console.log(`[files] WRITE ${filePath}`);
        
        const response = await fetch(fileServerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          signal: AbortSignal.timeout(30000),
        });
        
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
      }
      
      case 'mkdir': {
        const body = await request.json();
        const { path: dirPath } = body;
        
        if (!dirPath) {
          return NextResponse.json({ error: 'Path required' }, { status: 400 });
        }
        
        const fileServerUrl = getFileServerUrl(
          gateway.appName,
          '/mkdir',
          gateway.token,
          { path: dirPath }
        );
        
        console.log(`[files] MKDIR ${dirPath}`);
        
        const response = await fetch(fileServerUrl, {
          method: 'POST',
          signal: AbortSignal.timeout(30000),
        });
        
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
      }
      
      case 'move': {
        const body = await request.json();
        const { from, to } = body;
        
        if (!from || !to) {
          return NextResponse.json({ error: 'From and to paths required' }, { status: 400 });
        }
        
        const fileServerUrl = getFileServerUrl(
          gateway.appName,
          '/move',
          gateway.token
        );
        
        console.log(`[files] MOVE ${from} -> ${to}`);
        
        const response = await fetch(fileServerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to }),
          signal: AbortSignal.timeout(30000),
        });
        
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
      }
      
      case 'upload': {
        // Get the file from form data
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const filePath = formData.get('path') as string | null;
        
        if (!file || !filePath) {
          return NextResponse.json({ error: 'File and path required' }, { status: 400 });
        }
        
        console.log(`[files] UPLOAD ${filePath} (${file.size} bytes)`);
        
        const fileServerUrl = getFileServerUrl(
          gateway.appName,
          '/upload',
          gateway.token,
          { path: filePath }
        );
        
        // Stream the file directly to the file server
        const response = await fetch(fileServerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': file.size.toString(),
          },
          body: file.stream(),
          signal: AbortSignal.timeout(120000), // 2 min for large files
          // @ts-ignore - duplex is needed for streaming
          duplex: 'half',
        });
        
        const data = await response.json();
        
        if (response.ok) {
          console.log(`[files] UPLOAD success: ${filePath}`);
        } else {
          console.error(`[files] UPLOAD failed:`, data);
        }
        
        return NextResponse.json(data, { status: response.status });
      }
      
      default:
        return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('[files] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// DELETE HANDLER
// ============================================

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
