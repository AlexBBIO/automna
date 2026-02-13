/**
 * GET /api/user/credits — Get credit balance and settings
 * POST /api/user/credits — Update auto-refill and cost cap settings
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creditBalances, creditTransactions, CREDIT_PACKS } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let balance = await db.query.creditBalances.findFirst({
      where: eq(creditBalances.userId, userId),
    });

    // Auto-create balance record if not exists
    if (!balance) {
      await db.insert(creditBalances).values({ userId, balance: 0 }).onConflictDoNothing();
      balance = await db.query.creditBalances.findFirst({
        where: eq(creditBalances.userId, userId),
      });
    }

    // Reset monthly spent if past reset date
    if (balance && balance.monthlySpentResetAt && balance.monthlySpentResetAt < Math.floor(Date.now() / 1000)) {
      const nextReset = getNextMonthReset();
      await db.update(creditBalances)
        .set({ monthlySpentCents: 0, monthlySpentResetAt: nextReset, updatedAt: new Date() })
        .where(eq(creditBalances.userId, userId));
      balance = { ...balance, monthlySpentCents: 0, monthlySpentResetAt: nextReset };
    }

    // Get recent transactions
    const recentTransactions = await db.query.creditTransactions.findMany({
      where: eq(creditTransactions.userId, userId),
      orderBy: [desc(creditTransactions.createdAt)],
      limit: 20,
    });

    return NextResponse.json({
      balance: balance?.balance ?? 0,
      autoRefill: {
        enabled: balance?.autoRefillEnabled === 1,
        amountCents: balance?.autoRefillAmountCents ?? 1000,
        threshold: balance?.autoRefillThreshold ?? 10000,
      },
      costCap: {
        monthlyCents: balance?.monthlyCostCapCents ?? 0,
        spentCents: balance?.monthlySpentCents ?? 0,
      },
      packs: CREDIT_PACKS,
      transactions: recentTransactions.map(t => ({
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        description: t.description,
        createdAt: t.createdAt ? new Date(t.createdAt as unknown as number).toISOString() : null,
      })),
    });
  } catch (error) {
    console.error('[credits] GET error:', error);
    return NextResponse.json({ error: 'Failed to get credits' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { autoRefillEnabled, autoRefillAmountCents, autoRefillThreshold, monthlyCostCapCents } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (autoRefillEnabled !== undefined) updates.autoRefillEnabled = autoRefillEnabled ? 1 : 0;
    if (autoRefillAmountCents !== undefined) updates.autoRefillAmountCents = Math.max(500, autoRefillAmountCents);
    if (autoRefillThreshold !== undefined) updates.autoRefillThreshold = Math.max(1000, autoRefillThreshold);
    if (monthlyCostCapCents !== undefined) updates.monthlyCostCapCents = Math.max(0, monthlyCostCapCents);

    // Ensure record exists
    await db.insert(creditBalances).values({ userId, balance: 0 }).onConflictDoNothing();
    await db.update(creditBalances).set(updates).where(eq(creditBalances.userId, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[credits] POST error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

function getNextMonthReset(): number {
  const now = new Date();
  return Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime() / 1000);
}
