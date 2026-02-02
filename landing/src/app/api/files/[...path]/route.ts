/**
 * Files API Routes
 * 
 * Provides file operations for the user's agent workspace.
 * Uses exec commands via WebSocket to the user's Fly gateway.
 * 
 * Endpoints:
 * - GET /api/files/list?path=/root/clawd - List directory
 * - GET /api/files/read?path=/root/clawd/file.md - Read file
 * - POST /api/files/write - Write file
 * - POST /api/files/mkdir - Create directory
 * - DELETE /api/files?path=/root/clawd/file.md - Delete file
 * - GET /api/files/download?path=/root/clawd/file.png - Download file
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Allowed base paths for file operations
// OpenClaw stores data in /home/node/.openclaw
const ALLOWED_PATHS = ['/home/node/.openclaw', '/home/node/clawd', '/root/clawd'];

// Max file size for read operations (5MB)
const MAX_READ_SIZE = 5 * 1024 * 1024;

// ============================================
// UTILITIES
// ============================================

function validatePath(path: string): boolean {
  // Must start with allowed path
  if (!ALLOWED_PATHS.some(base => path.startsWith(base))) {
    return false;
  }
  // No path traversal
  if (path.includes('..')) {
    return false;
  }
  return true;
}

async function getUserGateway(clerkId: string) {
  const userMachine = await db.query.machines.findFirst({
    where: eq(machines.userId, clerkId),
  });
  
  if (!userMachine || !userMachine.appName || !userMachine.gatewayToken) {
    return null;
  }
  
  return {
    appName: userMachine.appName,
    machineId: userMachine.id, // Fly machine ID
    token: userMachine.gatewayToken,
  };
}

async function execCommand(appName: string, machineId: string, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  // Use Fly machines exec API
  const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
  
  if (!FLY_API_TOKEN) {
    console.error('[files] FLY_API_TOKEN not found in env');
    throw new Error('FLY_API_TOKEN not configured');
  }
  
  console.log('[files] execCommand:', { appName, machineId, command: command.substring(0, 50) });
  
  const url = `https://api.machines.dev/v1/apps/${appName}/machines/${machineId}/exec`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: ['/bin/sh', '-c', command],
      }),
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('[files] Fly exec error:', response.status, text);
      throw new Error(`Fly exec failed: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      code: data.exit_code || 0,
    };
  } catch (err) {
    console.error('[files] Exec error:', err);
    throw err;
  }
}

// Parse ls -la output into file objects
function parseLsOutput(output: string, basePath: string): Array<{
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  extension?: string;
}> {
  const lines = output.trim().split('\n');
  const files = [];
  
  for (const line of lines) {
    // Skip total line and empty lines
    if (line.startsWith('total') || !line.trim()) continue;
    
    // Parse: drwxr-xr-x 2 node node 4096 2026-02-02 17:30 dirname
    // Or:   -rw-r--r-- 1 node node 2048 2026-02-02 15:00 filename.md
    const parts = line.split(/\s+/);
    if (parts.length < 8) continue;
    
    const permissions = parts[0];
    const size = parseInt(parts[4], 10) || 0;
    const date = parts[5]; // 2026-02-02
    const time = parts[6]; // 17:30
    const name = parts.slice(7).join(' ');
    
    // Skip . and ..
    if (name === '.' || name === '..') continue;
    
    const isDirectory = permissions.startsWith('d');
    const ext = isDirectory ? undefined : name.split('.').pop();
    
    files.push({
      name,
      path: `${basePath}/${name}`.replace(/\/+/g, '/'),
      type: isDirectory ? 'directory' as const : 'file' as const,
      size,
      modified: `${date}T${time}:00Z`,
      extension: ext,
    });
  }
  
  // Sort: directories first, then by name
  files.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  
  return files;
}

// ============================================
// HANDLERS
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const operation = pathSegments[0];
  const filePath = request.nextUrl.searchParams.get('path') || '/root/clawd';
  
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const gateway = await getUserGateway(clerkId);
    if (!gateway) {
      return NextResponse.json({ error: 'No gateway configured' }, { status: 404 });
    }
    
    if (!validatePath(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    
    switch (operation) {
      case 'list': {
        try {
          console.log('[files] Listing directory:', filePath, 'via', gateway.appName, gateway.machineId);
          const result = await execCommand(
            gateway.appName,
            gateway.machineId,
            `ls -la --time-style=long-iso "${filePath}"`
          );
          
          console.log('[files] ls stdout:', result.stdout?.substring(0, 200));
          const files = parseLsOutput(result.stdout, filePath);
          return NextResponse.json({ files });
        } catch (err) {
          // Return error with details so we can debug
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('[files] Exec failed:', errorMsg);
          return NextResponse.json({ 
            files: [],
            error: `File listing failed: ${errorMsg}`
          }, { status: 500 });
        }
      }
      
      case 'read': {
        try {
          // Check file size first
          const statResult = await execCommand(
            gateway.appName,
            gateway.machineId,
            `stat -c %s "${filePath}" 2>/dev/null || echo 0`
          );
          
          const size = parseInt(statResult.stdout.trim(), 10) || 0;
          if (size > MAX_READ_SIZE) {
            return NextResponse.json(
              { error: `File too large (${size} bytes, max ${MAX_READ_SIZE})` },
              { status: 413 }
            );
          }
          
          const result = await execCommand(
            gateway.appName,
            gateway.machineId,
            `cat "${filePath}"`
          );
          
          return NextResponse.json({
            content: result.stdout,
            size,
            encoding: 'utf-8',
          });
        } catch (err) {
          console.warn('[files] Read failed:', err);
          return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
        }
      }
      
      case 'download': {
        try {
          // For binary files, base64 encode
          const result = await execCommand(
            gateway.appName,
            gateway.machineId,
            `base64 "${filePath}"`
          );
          
          const buffer = Buffer.from(result.stdout.trim(), 'base64');
          const filename = filePath.split('/').pop() || 'download';
          
          return new NextResponse(buffer, {
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Content-Length': buffer.length.toString(),
            },
          });
        } catch (err) {
          console.warn('[files] Download failed:', err);
          return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
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
        
        if (!filePath || !validatePath(filePath)) {
          return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
        }
        
        try {
          // Use heredoc for multi-line content
          const escapedContent = content.replace(/'/g, "'\\''");
          await execCommand(
            gateway.appName,
            gateway.machineId,
            `cat > "${filePath}" << 'AUTOMNA_EOF'\n${escapedContent}\nAUTOMNA_EOF`
          );
          
          return NextResponse.json({ success: true, path: filePath });
        } catch (err) {
          console.warn('[files] Write failed:', err);
          return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
        }
      }
      
      case 'mkdir': {
        const body = await request.json();
        const { path: dirPath } = body;
        
        if (!dirPath || !validatePath(dirPath)) {
          return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
        }
        
        try {
          await execCommand(
            gateway.appName,
            gateway.machineId,
            `mkdir -p "${dirPath}"`
          );
          
          return NextResponse.json({ success: true, path: dirPath });
        } catch (err) {
          console.warn('[files] Mkdir failed:', err);
          return NextResponse.json({ error: 'Failed to create directory' }, { status: 500 });
        }
      }
      
      case 'move': {
        const body = await request.json();
        const { from, to } = body;
        
        if (!from || !to || !validatePath(from) || !validatePath(to)) {
          return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
        }
        
        try {
          await execCommand(
            gateway.appName,
            gateway.machineId,
            `mv "${from}" "${to}"`
          );
          
          return NextResponse.json({ success: true });
        } catch (err) {
          console.warn('[files] Move failed:', err);
          return NextResponse.json({ error: 'Failed to move file' }, { status: 500 });
        }
      }
      
      case 'upload': {
        // Handle multipart form data
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const filePath = formData.get('path') as string | null;
        
        if (!file || !filePath || !validatePath(filePath)) {
          console.log('[files] Upload validation failed:', { hasFile: !!file, filePath });
          return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
        }
        
        console.log('[files] Starting upload:', { filename: file.name, size: file.size, path: filePath });
        
        try {
          // Convert file to base64
          const buffer = await file.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          
          // Get parent directory
          const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
          
          console.log('[files] Upload base64 length:', base64.length, 'parentDir:', parentDir);
          
          // Create parent directory first
          const mkdirResult = await execCommand(
            gateway.appName,
            gateway.machineId,
            `mkdir -p "${parentDir}"`
          );
          
          if (mkdirResult.code !== 0) {
            console.error('[files] mkdir failed:', mkdirResult.stderr);
            return NextResponse.json({ error: 'Failed to create directory' }, { status: 500 });
          }
          
          // Write base64 to temp file, decode, and cleanup
          // Use printf to avoid issues with echo and special chars
          const writeResult = await execCommand(
            gateway.appName,
            gateway.machineId,
            `printf '%s' '${base64}' | base64 -d > "${filePath}"`
          );
          
          if (writeResult.code !== 0) {
            console.error('[files] Write failed:', writeResult.stderr);
            return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
          }
          
          // Verify file exists
          const verifyResult = await execCommand(
            gateway.appName,
            gateway.machineId,
            `test -f "${filePath}" && stat -c %s "${filePath}"`
          );
          
          if (verifyResult.code !== 0) {
            console.error('[files] Verify failed:', verifyResult.stderr);
            return NextResponse.json({ error: 'File not created' }, { status: 500 });
          }
          
          console.log('[files] Upload success:', filePath, 'size:', verifyResult.stdout.trim());
          return NextResponse.json({ success: true, path: filePath });
        } catch (err) {
          console.error('[files] Upload failed:', err);
          return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
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
    
    if (!filePath || !validatePath(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    
    try {
      // Use trash if available, otherwise rm
      await execCommand(
        gateway.appName,
        gateway.machineId,
        `trash "${filePath}" 2>/dev/null || rm -rf "${filePath}"`
      );
      
      return NextResponse.json({ success: true });
    } catch (err) {
      console.warn('[files] Delete failed:', err);
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
    }
  } catch (error) {
    console.error('[files] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
