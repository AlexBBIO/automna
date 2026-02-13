import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import Stripe from 'stripe';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

// Map price IDs to plan names (reverse lookup)
// Includes both legacy and new BYOK price IDs
const PRICE_TO_PLAN: Record<string, string> = {};
// Legacy prices
if (process.env.STRIPE_PRICE_LITE) PRICE_TO_PLAN[process.env.STRIPE_PRICE_LITE] = 'lite';
if (process.env.STRIPE_PRICE_STARTER) PRICE_TO_PLAN[process.env.STRIPE_PRICE_STARTER] = 'starter';
if (process.env.STRIPE_PRICE_PRO) PRICE_TO_PLAN[process.env.STRIPE_PRICE_PRO] = 'pro';
if (process.env.STRIPE_PRICE_BUSINESS) PRICE_TO_PLAN[process.env.STRIPE_PRICE_BUSINESS] = 'business';
if (process.env.STRIPE_PRICE_LITE_ANNUAL) PRICE_TO_PLAN[process.env.STRIPE_PRICE_LITE_ANNUAL] = 'lite';
if (process.env.STRIPE_PRICE_STARTER_ANNUAL) PRICE_TO_PLAN[process.env.STRIPE_PRICE_STARTER_ANNUAL] = 'starter';
if (process.env.STRIPE_PRICE_PRO_ANNUAL) PRICE_TO_PLAN[process.env.STRIPE_PRICE_PRO_ANNUAL] = 'pro';
if (process.env.STRIPE_PRICE_BUSINESS_ANNUAL) PRICE_TO_PLAN[process.env.STRIPE_PRICE_BUSINESS_ANNUAL] = 'business';
// BYOK prices
if (process.env.STRIPE_PRICE_STARTER_BYOK) PRICE_TO_PLAN[process.env.STRIPE_PRICE_STARTER_BYOK] = 'starter';
if (process.env.STRIPE_PRICE_PRO_BYOK) PRICE_TO_PLAN[process.env.STRIPE_PRICE_PRO_BYOK] = 'pro';
if (process.env.STRIPE_PRICE_POWER_BYOK) PRICE_TO_PLAN[process.env.STRIPE_PRICE_POWER_BYOK] = 'power';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { priceId, plan } = await request.json();

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID required' }, { status: 400 });
    }

    let subscriptionId = user.publicMetadata?.stripeSubscriptionId as string | undefined;
    const customerId = user.publicMetadata?.stripeCustomerId as string | undefined;

    const stripe = getStripe();

    // Try to retrieve subscription, fall back to looking up by customer
    let subscription: Stripe.Subscription | null = null;
    
    if (subscriptionId) {
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (e) {
        console.warn(`[upgrade] Subscription ${subscriptionId} not found, trying customer lookup`);
        subscription = null;
      }
    }

    // If subscription lookup failed or ID missing, try by customer
    if (!subscription && customerId) {
      try {
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
        if (subs.data.length > 0) {
          subscription = subs.data[0];
          subscriptionId = subscription.id;
          console.log(`[upgrade] Found subscription ${subscriptionId} via customer lookup`);
        }
      } catch (e) {
        console.error('[upgrade] Customer subscription lookup failed:', e);
      }
    }

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription found. Use /api/checkout instead.' },
        { status: 400 }
      );
    }

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json(
        { error: 'Subscription is not active. Please resubscribe.' },
        { status: 400 }
      );
    }

    const existingItem = subscription.items.data[0];
    if (!existingItem) {
      return NextResponse.json(
        { error: 'No subscription item found' },
        { status: 400 }
      );
    }

    // Don't allow switching to the exact same price
    if (existingItem.price.id === priceId) {
      return NextResponse.json(
        { error: 'Already on this plan and billing period' },
        { status: 400 }
      );
    }

    // Determine if this is an upgrade, downgrade, or billing period change
    // Combined order: legacy plans map into BYOK equivalents for ranking
    const planRank: Record<string, number> = {
      free: 0, lite: 1, starter: 1, pro: 2, power: 3, business: 3,
    };
    const currentPlan = subscription.metadata?.plan || 'starter';
    const newPlan = plan || PRICE_TO_PLAN[priceId] || 'starter';
    const currentRank = planRank[currentPlan] ?? 1;
    const newRank = planRank[newPlan] ?? 1;
    const isDowngrade = newRank < currentRank;
    const isSamePlan = newRank === currentRank;

    // Preview the proration to show the user what they'll be charged
    const previewMode = new URL(request.url).searchParams.get('preview') === 'true';

    if (previewMode) {
      const periodEnd = (subscription as any).current_period_end;
      const nextBillingDate = periodEnd 
        ? new Date(periodEnd * 1000).toISOString() 
        : new Date(Date.now() + 30 * 86400000).toISOString(); // fallback: ~30 days

      if (isDowngrade) {
        // Downgrades: no proration, takes effect next billing cycle
        // Look up the new price to show what they'll pay next
        const newPrice = await stripe.prices.retrieve(priceId);
        const newAmount = (newPrice.unit_amount || 0) / 100;

        return NextResponse.json({
          preview: true,
          isDowngrade: true,
          prorationAmount: 0,
          totalDueNow: 0,
          newMonthlyPrice: newAmount,
          nextBillingDate,
          currency: newPrice.currency,
        });
      }

      // Upgrades and billing changes: show prorated amount
      const invoice = await stripe.invoices.createPreview({
        customer: subscription.customer as string,
        subscription: subscriptionId,
        subscription_details: {
          items: [
            {
              id: existingItem.id,
              price: priceId,
            },
          ],
          proration_behavior: 'create_prorations',
        },
      });

      // Find the proration line items
      const prorationLines = invoice.lines.data.filter(
        (line) => (line as any).parent?.subscription_item_details?.proration === true
      );
      const prorationAmount = prorationLines.reduce(
        (sum, line) => sum + line.amount,
        0
      );

      return NextResponse.json({
        preview: true,
        isDowngrade: false,
        isBillingChange: isSamePlan,
        prorationAmount: prorationAmount / 100,
        totalDueNow: Math.max(0, prorationAmount) / 100,
        nextBillingDate,
        currency: invoice.currency,
      });
    }

    // Upgrades: immediate with proration
    // Downgrades: take effect at end of billing period (no proration)
    // Billing period changes (same plan): immediate with proration
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId!, {
      items: [
        {
          id: existingItem.id,
          price: priceId,
        },
      ],
      proration_behavior: isDowngrade ? 'none' : 'create_prorations',
      ...(isDowngrade && {
        // Schedule the downgrade for end of current period
        cancel_at_period_end: false, // Don't cancel, just change
        billing_cycle_anchor: 'unchanged' as any,
      }),
      metadata: {
        ...subscription.metadata,
        plan: newPlan,
        upgradedAt: new Date().toISOString(),
        previousPriceId: existingItem.price.id,
        changeType: isDowngrade ? 'downgrade' : isSamePlan ? 'billing_change' : 'upgrade',
      },
    });

    // Update Clerk metadata immediately (don't wait for webhook)
    const { clerkClient: getClerk } = await import('@clerk/nextjs/server');
    const client = await getClerk();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscriptionId,
        plan: newPlan,
        subscriptionStatus: updatedSubscription.status,
      },
    });

    console.log(`[upgrade] User ${userId} upgraded to ${newPlan} (price: ${priceId})`);

    return NextResponse.json({
      success: true,
      plan: newPlan,
      subscriptionId: updatedSubscription.id,
      status: updatedSubscription.status,
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upgrade';
    // Include Stripe error details if available
    const stripeError = (error as any)?.raw?.message || (error as any)?.message;
    return NextResponse.json({ error: stripeError || message }, { status: 500 });
  }
}
