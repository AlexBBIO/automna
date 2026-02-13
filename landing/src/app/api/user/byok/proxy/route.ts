/**
 * POST /api/user/byok/proxy
 * 
 * Mark user as using proxy mode (bill me as I go).
 * This skips BYOK credential setup and keeps the machine in proxy/legacy mode.
 * The user's plan credit allowance covers their AI usage through the Automna proxy.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { machines, machineEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update machines table — explicitly mark as NOT byok (proxy mode)
    await db.update(machines)
      .set({ byokProvider: 'proxy', byokEnabled: 0, updatedAt: new Date() })
      .where(eq(machines.userId, userId));

    // Log event
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    if (machine) {
      await db.insert(machineEvents).values({
        machineId: machine.id,
        eventType: 'proxy_mode_selected',
        details: JSON.stringify({ source: 'setup_connect' }),
      });
    }

    return NextResponse.json({ success: true, mode: 'proxy' });
  } catch (error) {
    console.error('[byok/proxy] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to set proxy mode' },
      { status: 500 }
    );
  }
}
