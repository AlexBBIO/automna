import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { sendSubscriptionStarted, sendSubscriptionCanceled, sendPaymentFailed } from '@/lib/email';
import { db } from '@/lib/db';
import { machines } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Initialize Stripe lazily to avoid build-time errors
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Update the user's plan in the machines table.
 * This is critical for rate limiting - the LLM proxy reads plan from here.
 */
async function updateMachinePlan(userId: string, plan: string): Promise<void> {
  try {
    await db
      .update(machines)
      .set({ plan, updatedAt: new Date() })
      .where(eq(machines.userId, userId));
    console.log(`[stripe] Updated machines.plan for ${userId} to ${plan}`);
  } catch (error) {
    // Log but don't fail the webhook - Clerk update is the primary record
    console.error(`[stripe] Failed to update machines.plan for ${userId}:`, error);
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature')!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  const stripe = getStripe();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerkUserId;
        const plan = session.metadata?.plan || 'starter';

        if (clerkUserId) {
          // Update Clerk metadata (source of truth for user profile)
          const client = await clerkClient();
          await client.users.updateUserMetadata(clerkUserId, {
            publicMetadata: {
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              plan: plan,
              subscriptionStatus: 'active',
            },
          });
          
          // Update machines table (used for rate limiting)
          await updateMachinePlan(clerkUserId, plan);
          
          console.log(`[stripe] Upgraded user ${clerkUserId} to ${plan}`);

          // Send subscription started email
          if (session.customer_email) {
            await sendSubscriptionStarted(session.customer_email, plan);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) break;

        const clerkUserId = (customer as Stripe.Customer).metadata?.clerkUserId;
        if (clerkUserId) {
          const client = await clerkClient();
          await client.users.updateUserMetadata(clerkUserId, {
            publicMetadata: {
              subscriptionStatus: subscription.status,
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) break;

        const clerkUserId = (customer as Stripe.Customer).metadata?.clerkUserId;
        if (clerkUserId) {
          // Update Clerk metadata
          const client = await clerkClient();
          await client.users.updateUserMetadata(clerkUserId, {
            publicMetadata: {
              plan: 'free',
              subscriptionStatus: 'canceled',
              stripeSubscriptionId: null,
            },
          });
          
          // Update machines table (rate limiting will revert to free tier)
          await updateMachinePlan(clerkUserId, 'free');
          
          console.log(`[stripe] Canceled subscription for user ${clerkUserId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
