/**
 * Secrets API
 * 
 * POST /api/user/secrets - Create or update a secret
 * GET /api/user/secrets - List secret names (not values)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { secrets } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { encryptSecret } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, value } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!value || typeof value !== 'string') {
      return NextResponse.json({ error: 'Value is required' }, { status: 400 });
    }

    // Validate name format (alphanumeric, underscores, dashes)
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name)) {
      return NextResponse.json({ 
        error: 'Invalid name. Use letters, numbers, underscores, dashes. Start with letter. Max 64 chars.' 
      }, { status: 400 });
    }

    // Encrypt the value
    const { encrypted, iv } = encryptSecret(value, userId);

    // Check if secret exists
    const existing = await db.select()
      .from(secrets)
      .where(and(eq(secrets.userId, userId), eq(secrets.name, name)))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db.update(secrets)
        .set({
          encryptedValue: encrypted,
          iv,
          updatedAt: new Date(),
        })
        .where(and(eq(secrets.userId, userId), eq(secrets.name, name)));

      return NextResponse.json({ 
        success: true, 
        name, 
        created: false,
        message: 'Secret updated' 
      });
    } else {
      // Create new
      await db.insert(secrets).values({
        userId,
        name,
        encryptedValue: encrypted,
        iv,
      });

      return NextResponse.json({ 
        success: true, 
        name, 
        created: true,
        message: 'Secret created' 
      });
    }
  } catch (error) {
    console.error('Error saving secret:', error);
    return NextResponse.json({ error: 'Failed to save secret' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // List all secrets for user (names only, not values)
    const userSecrets = await db.select({
      name: secrets.name,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .where(eq(secrets.userId, userId))
    .orderBy(secrets.name);

    return NextResponse.json({ secrets: userSecrets });
  } catch (error) {
    console.error('Error listing secrets:', error);
    return NextResponse.json({ error: 'Failed to list secrets' }, { status: 500 });
  }
}
