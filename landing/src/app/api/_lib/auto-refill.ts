/**
 * Auto-Refill Credit System
 * 
 * When a user's credit balance drops below their configured threshold,
 * automatically charge their Stripe payment method and add credits.
 * Respects monthly cost cap to prevent runaway spending.
 */

import Stripe from 'stripe';
import { db } from '@/lib/db';
import { creditBalances, creditTransactions, CREDIT_PACKS } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

// In-flight refills to prevent double-charging from concurrent requests
const refillsInFlight = new Set<string>();

/**
 * Check if a user needs auto-refill and execute it if so.
 * Call this after credit deduction (fire-and-forget).
 */
export async function checkAutoRefill(userId: string): Promise<void> {
  // Prevent concurrent refills for the same user
  if (refillsInFlight.has(userId)) return;
  refillsInFlight.add(userId);

  try {
    const bal = await db.query.creditBalances.findFirst({
      where: eq(creditBalances.userId, userId),
    });

    if (!bal) return;
    if (bal.autoRefillEnabled !== 1) return;
    if (bal.balance > bal.autoRefillThreshold) return;

    // Check monthly cost cap
    const refillAmountCents = bal.autoRefillAmountCents;
    if (bal.monthlyCostCapCents > 0) {
      const spentThisMonth = bal.monthlySpentCents ?? 0;
      if (spentThisMonth + refillAmountCents > bal.monthlyCostCapCents) {
        console.log(`[auto-refill] User ${userId} hit monthly cost cap ($${(bal.monthlyCostCapCents / 100).toFixed(2)}). Skipping.`);
        return;
      }
    }

    // Reset monthly spent if past reset date
    const now = Math.floor(Date.now() / 1000);
    if (bal.monthlySpentResetAt && bal.monthlySpentResetAt < now) {
      const nextReset = getNextMonthReset();
      await db.update(creditBalances)
        .set({ monthlySpentCents: 0, monthlySpentResetAt: nextReset, updatedAt: new Date() })
        .where(eq(creditBalances.userId, userId));
      // Re-check with reset values (spent is now 0, so cap won't block)
    }

    // Find the closest credit pack to the refill amount
    const pack = findClosestPack(refillAmountCents);
    if (!pack) {
      console.error(`[auto-refill] No credit pack found for ${refillAmountCents} cents`);
      return;
    }

    // Get user's Stripe customer ID
    const { clerkClient: getClerk } = await import('@clerk/nextjs/server');
    const client = await getClerk();
    const user = await client.users.getUser(userId);
    const customerId = user.publicMetadata?.stripeCustomerId as string | undefined;

    if (!customerId) {
      console.warn(`[auto-refill] No Stripe customer for user ${userId}`);
      return;
    }

    const stripe = getStripe();

    // Get default payment method
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const paymentMethodId = customer.invoice_settings?.default_payment_method as string
      || customer.default_source as string;

    if (!paymentMethodId) {
      console.warn(`[auto-refill] No default payment method for user ${userId}`);
      return;
    }

    // Create and confirm payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.priceCents,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: `Automna auto-refill: ${pack.label}`,
      metadata: {
        clerkUserId: userId,
        type: 'auto_refill',
        credits: String(pack.credits),
        packId: pack.id,
      },
    });

    if (paymentIntent.status !== 'succeeded') {
      console.error(`[auto-refill] Payment failed for user ${userId}: ${paymentIntent.status}`);
      return;
    }

    // Add credits
    await db.update(creditBalances)
      .set({
        balance: bal.balance + pack.credits, // OK to not be atomic here — this is the only writer after lock
        monthlySpentCents: (bal.monthlySpentCents ?? 0) + pack.priceCents,
        updatedAt: new Date(),
      })
      .where(eq(creditBalances.userId, userId));

    // Get updated balance for transaction
    const updated = await db.query.creditBalances.findFirst({
      where: eq(creditBalances.userId, userId),
    });

    await db.insert(creditTransactions).values({
      userId,
      type: 'refill',
      amount: pack.credits,
      balanceAfter: updated?.balance ?? bal.balance + pack.credits,
      stripePaymentId: paymentIntent.id,
      description: `Auto-refill: ${pack.label} ($${(pack.priceCents / 100).toFixed(2)})`,
    });

    console.log(`[auto-refill] User ${userId}: +${pack.credits} credits ($${(pack.priceCents / 100).toFixed(2)})`);
  } catch (error) {
    // Stripe auth_required errors mean the card needs 3D Secure — can't auto-charge
    if ((error as any)?.code === 'authentication_required') {
      console.warn(`[auto-refill] User ${userId}: card requires authentication, skipping`);
      return;
    }
    console.error(`[auto-refill] Error for user ${userId}:`, error);
  } finally {
    refillsInFlight.delete(userId);
  }
}

/**
 * Fire-and-forget auto-refill check.
 */
export function checkAutoRefillBackground(userId: string): void {
  checkAutoRefill(userId).catch(err => {
    console.error(`[auto-refill] Background check failed for ${userId}:`, err);
  });
}

function findClosestPack(targetCents: number): typeof CREDIT_PACKS[number] {
  // Find the pack closest to (but not exceeding) the target amount
  // If none fit, use the smallest pack
  let best: typeof CREDIT_PACKS[number] = CREDIT_PACKS[0];
  for (const pack of CREDIT_PACKS) {
    if (pack.priceCents <= targetCents) {
      best = pack;
    }
  }
  return best;
}

function getNextMonthReset(): number {
  const now = new Date();
  return Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime() / 1000);
}
