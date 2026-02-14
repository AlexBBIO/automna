/**
 * POST /api/user/byok/proxy
 * 
 * Mark user as using proxy mode (bill me as I go).
 * This skips BYOK credential setup and keeps the machine in proxy/legacy mode.
 * User must buy prepaid credits for AI usage through the Automna proxy.
 * New users get a small starter bonus (5K credits) to try it out.
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { machines, machineEvents, creditBalances, creditTransactions, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const STARTER_BONUS_CREDITS = 5_000; // Free starter credits for new proxy users

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user record exists (normally created by /api/user/sync from dashboard,
    // but user hits this route from /setup/connect before reaching dashboard)
    const clerkUser = await currentUser();
    await db.insert(users).values({
      id: userId,
      email: clerkUser?.emailAddresses?.[0]?.emailAddress ?? null,
      name: clerkUser?.firstName ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() : null,
    }).onConflictDoNothing();

    // Store choice in Clerk metadata so it persists before machine exists
    const { clerkClient: getClerk } = await import('@clerk/nextjs/server');
    const client = await getClerk();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { byokChoice: 'proxy' },
    });

    // Update machines table (may be 0 rows if machine not provisioned yet — that's OK)
    await db.update(machines)
      .set({ byokProvider: 'proxy', byokEnabled: 0, updatedAt: new Date() })
      .where(eq(machines.userId, userId));

    // Give new proxy users starter credits so they can try it immediately
    const existingBalance = await db.query.creditBalances.findFirst({
      where: eq(creditBalances.userId, userId),
    });

    if (!existingBalance) {
      await db.insert(creditBalances).values({
        userId,
        balance: STARTER_BONUS_CREDITS,
      });
      await db.insert(creditTransactions).values({
        userId,
        type: 'bonus',
        amount: STARTER_BONUS_CREDITS,
        balanceAfter: STARTER_BONUS_CREDITS,
        description: 'Welcome bonus — enough for a few conversations',
      });
    } else if (existingBalance.balance === 0) {
      // Returning proxy user with 0 balance — give them the bonus if they never got one
      const hasBonusBefore = await db.query.creditTransactions.findFirst({
        where: eq(creditTransactions.userId, userId),
      });
      // Simple check: if no transactions at all, give the bonus
      if (!hasBonusBefore) {
        await db.update(creditBalances)
          .set({ balance: STARTER_BONUS_CREDITS, updatedAt: new Date() })
          .where(eq(creditBalances.userId, userId));
        await db.insert(creditTransactions).values({
          userId,
          type: 'bonus',
          amount: STARTER_BONUS_CREDITS,
          balanceAfter: STARTER_BONUS_CREDITS,
          description: 'Welcome bonus — enough for a few conversations',
        });
      }
    }

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
