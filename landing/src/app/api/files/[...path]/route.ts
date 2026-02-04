/**
 * Files API Routes
 * 
 * Proxies file operations through the user's gateway to the internal file server.
 * The gateway (Caddy) routes /files/* to the file server internally.
 * 
 * Architecture:
 *   Vercel → Gateway (:443) → Caddy (:18789) → /files/* → File Server (:8080)
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
import { validateFilePath, validateFilePaths } from "../_lib/validation";

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
  // Route through gateway - Caddy proxies /files/* to internal file server
  const url = new URL(`https://${appName}.fly.dev/files${endpoint}`);
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
  const rawPath = request.nextUrl.searchParams.get('path') || '/home/node/.openclaw/workspace';
  
  // Validate path to prevent traversal attacks
  const pathValidation = validateFilePath(rawPath);
  if (!pathValidation.valid) {
    return NextResponse.json({ error: pathValidation.error }, { status: 400 });
  }
  const filePath = pathValidation.normalized!;
  
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
        const { path: rawPath, content } = body;
        
        if (!rawPath) {
          return NextResponse.json({ error: 'Path required' }, { status: 400 });
        }
        
        // Validate path
        const pathValidation = validateFilePath(rawPath);
        if (!pathValidation.valid) {
          return NextResponse.json({ error: pathValidation.error }, { status: 400 });
        }
        const filePath = pathValidation.normalized!;
        
        const fileServerUrl = getFileServerUrl(
          gateway.appName,
          '/write',
          gateway.token,
          { path: filePath }
        );
        
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
        const { path: rawPath } = body;
        
        if (!rawPath) {
          return NextResponse.json({ error: 'Path required' }, { status: 400 });
        }
        
        // Validate path
        const pathValidation = validateFilePath(rawPath);
        if (!pathValidation.valid) {
          return NextResponse.json({ error: pathValidation.error }, { status: 400 });
        }
        const dirPath = pathValidation.normalized!;
        
        const fileServerUrl = getFileServerUrl(
          gateway.appName,
          '/mkdir',
          gateway.token,
          { path: dirPath }
        );
        
        const response = await fetch(fileServerUrl, {
          method: 'POST',
          signal: AbortSignal.timeout(30000),
        });
        
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
      }
      
      case 'move': {
        const body = await request.json();
        const { from: rawFrom, to: rawTo } = body;
        
        if (!rawFrom || !rawTo) {
          return NextResponse.json({ error: 'From and to paths required' }, { status: 400 });
        }
        
        // Validate both paths
        const pathsValidation = validateFilePaths([rawFrom, rawTo]);
        if (!pathsValidation.valid) {
          return NextResponse.json({ error: pathsValidation.error }, { status: 400 });
        }
        const from = validateFilePath(rawFrom).normalized!;
        const to = validateFilePath(rawTo).normalized!;
        
        const fileServerUrl = getFileServerUrl(
          gateway.appName,
          '/move',
          gateway.token
        );
        
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
        const rawPath = formData.get('path') as string | null;
        
        if (!file || !rawPath) {
          return NextResponse.json({ error: 'File and path required' }, { status: 400 });
        }
        
        // Validate path
        const pathValidation = validateFilePath(rawPath);
        if (!pathValidation.valid) {
          return NextResponse.json({ error: pathValidation.error }, { status: 400 });
        }
        const filePath = pathValidation.normalized!;
        
        const fileServerUrl = getFileServerUrl(
          gateway.appName,
          '/upload',
          gateway.token,
          { path: filePath }
        );
        
        try {
          // Convert file to buffer
          const buffer = Buffer.from(await file.arrayBuffer());
          
          const response = await fetch(fileServerUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': buffer.length.toString(),
            },
            body: buffer,
            signal: AbortSignal.timeout(120000), // 2 min for large files
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            console.error(`[files] Upload failed: ${filePath}`, data);
          }
          
          return NextResponse.json(data, { status: response.status });
        } catch (err) {
          console.error('[files] Upload error:', err);
          return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
        }
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
  const rawPath = request.nextUrl.searchParams.get('path');
  
  if (!rawPath) {
    return NextResponse.json({ error: 'Path required' }, { status: 400 });
  }
  
  // Validate path
  const pathValidation = validateFilePath(rawPath);
  if (!pathValidation.valid) {
    return NextResponse.json({ error: pathValidation.error }, { status: 400 });
  }
  const filePath = pathValidation.normalized!;
  
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
      '/delete',
      gateway.token,
      { path: filePath }
    );
    
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
