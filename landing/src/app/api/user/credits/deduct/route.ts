/**
 * POST /api/user/credits/deduct — Deduct credits from user's balance (called by proxy)
 * Also triggers auto-refill if enabled and balance is low.
 * 
 * Body: { userId: string, amount: number, description?: string }
 * Auth: Internal API key (PROXY_API_SECRET)
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creditBalances, creditTransactions, CREDIT_PACKS } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import Stripe from 'stripe';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    // Authenticate proxy requests
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.PROXY_API_SECRET;
    if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, amount, description } = await request.json();
    if (!userId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Get current balance
    const balance = await db.query.creditBalances.findFirst({
      where: eq(creditBalances.userId, userId),
    });

    if (!balance) {
      return NextResponse.json({ error: 'No credit balance', allowed: false }, { status: 404 });
    }

    const currentBalance = balance.balance;
    if (currentBalance <= 0) {
      return NextResponse.json({ allowed: false, balance: 0, reason: 'no_credits' });
    }

    // Deduct credits
    const newBalance = Math.max(0, currentBalance - amount);
    await db.update(creditBalances)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(creditBalances.userId, userId));

    // Log transaction
    await db.insert(creditTransactions).values({
      userId,
      type: 'usage',
      amount: -amount,
      balanceAfter: newBalance,
      description: description || 'AI usage',
    });

    // Check if auto-refill should trigger
    if (balance.autoRefillEnabled && newBalance < balance.autoRefillThreshold) {
      await triggerAutoRefill(userId, balance);
    }

    return NextResponse.json({
      allowed: true,
      balance: newBalance,
      deducted: amount,
    });
  } catch (error) {
    console.error('[credits/deduct] Error:', error);
    return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
  }
}

async function triggerAutoRefill(userId: string, balance: typeof creditBalances.$inferSelect) {
  try {
    // Check monthly cost cap
    const monthlyCap = balance.monthlyCostCapCents;
    const monthlySpent = balance.monthlySpentCents;
    const refillAmount = balance.autoRefillAmountCents;

    if (monthlyCap > 0 && (monthlySpent + refillAmount) > monthlyCap) {
      console.log(`[credits] Auto-refill blocked by cost cap for ${userId}: spent $${monthlySpent / 100}/$${monthlyCap / 100}`);
      return;
    }

    // Find the closest credit pack to the refill amount
    const pack = CREDIT_PACKS.reduce((closest, p) =>
      Math.abs(p.priceCents - refillAmount) < Math.abs(closest.priceCents - refillAmount) ? p : closest
    );

    // Get Stripe customer ID from Clerk
    const { clerkClient: getClerk } = await import('@clerk/nextjs/server');
    const client = await getClerk();
    const user = await client.users.getUser(userId);
    const customerId = user.publicMetadata?.stripeCustomerId as string;

    if (!customerId) {
      console.error(`[credits] Auto-refill: no Stripe customer for ${userId}`);
      return;
    }

    const stripe = getStripe();

    // Get default payment method
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const defaultPM = customer.invoice_settings?.default_payment_method as string
      || (await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })).data[0]?.id;

    if (!defaultPM) {
      console.error(`[credits] Auto-refill: no payment method for ${userId}`);
      return;
    }

    // Create payment intent and confirm immediately
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.priceCents,
      currency: 'usd',
      customer: customerId,
      payment_method: defaultPM,
      off_session: true,
      confirm: true,
      metadata: {
        clerkUserId: userId,
        type: 'credit_auto_refill',
        packId: pack.id,
        credits: String(pack.credits),
      },
    });

    if (paymentIntent.status === 'succeeded') {
      // Add credits
      await db.update(creditBalances)
        .set({
          balance: sql`${creditBalances.balance} + ${pack.credits}`,
          monthlySpentCents: sql`${creditBalances.monthlySpentCents} + ${pack.priceCents}`,
          updatedAt: new Date(),
        })
        .where(eq(creditBalances.userId, userId));

      const updated = await db.query.creditBalances.findFirst({
        where: eq(creditBalances.userId, userId),
      });

      await db.insert(creditTransactions).values({
        userId,
        type: 'refill',
        amount: pack.credits,
        balanceAfter: updated?.balance ?? pack.credits,
        stripePaymentId: paymentIntent.id,
        description: `Auto-refill: ${pack.label} ($${pack.priceCents / 100})`,
      });

      console.log(`[credits] Auto-refill: ${userId} +${pack.credits} credits ($${pack.priceCents / 100})`);
    }
  } catch (error) {
    console.error(`[credits] Auto-refill failed for ${userId}:`, error);
  }
}
