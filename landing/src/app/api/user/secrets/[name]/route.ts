/**
 * Individual Secret API
 * 
 * GET /api/user/secrets/:name - Get decrypted secret value
 * DELETE /api/user/secrets/:name - Delete a secret
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { secrets, machines } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptSecret } from '@/lib/crypto';

interface RouteParams {
  params: Promise<{ name: string }>;
}

/**
 * Get a decrypted secret value
 * 
 * Supports two auth methods:
 * 1. Clerk session (dashboard access)
 * 2. Gateway token (agent access)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    
    // Try Clerk auth first
    const { userId } = await auth();
    
    let authenticatedUserId = userId;
    
    // If no Clerk session, try gateway token auth
    if (!authenticatedUserId) {
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '') || 
                    request.nextUrl.searchParams.get('token');
      
      if (token) {
        // Look up user by gateway token
        const machine = await db.select()
          .from(machines)
          .where(eq(machines.gatewayToken, token))
          .limit(1);
        
        if (machine.length > 0) {
          authenticatedUserId = machine[0].userId;
        }
      }
    }
    
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the secret
    const secret = await db.select()
      .from(secrets)
      .where(and(eq(secrets.userId, authenticatedUserId), eq(secrets.name, name)))
      .limit(1);

    if (secret.length === 0) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    // Decrypt the value
    const decrypted = decryptSecret(
      secret[0].encryptedValue,
      secret[0].iv,
      authenticatedUserId
    );

    return NextResponse.json({ 
      name: secret[0].name,
      value: decrypted,
    });
  } catch (error) {
    console.error('Error getting secret:', error);
    return NextResponse.json({ error: 'Failed to get secret' }, { status: 500 });
  }
}

/**
 * Delete a secret
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete the secret
    const result = await db.delete(secrets)
      .where(and(eq(secrets.userId, userId), eq(secrets.name, name)));

    return NextResponse.json({ 
      success: true,
      deleted: name,
    });
  } catch (error) {
    console.error('Error deleting secret:', error);
    return NextResponse.json({ error: 'Failed to delete secret' }, { status: 500 });
  }
}
