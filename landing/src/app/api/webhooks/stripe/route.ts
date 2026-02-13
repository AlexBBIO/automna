import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { sendSubscriptionStarted, sendSubscriptionCanceled, sendPaymentFailed, updateContactPlan } from '@/lib/email';
import { db } from '@/lib/db';
import { machines, machineEvents, phoneNumbers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { provisionPhoneNumber } from '@/lib/twilio';
import { importNumberToBland, configureInboundNumber } from '@/lib/bland';
import { trackServerEvent } from '@/lib/analytics';
import { canUsePhone } from '@/lib/feature-gates';

// Initialize Stripe lazily to avoid build-time errors
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

// All BYOK machines are same size: 1 shared CPU, 2GB RAM

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

// Machine scaling removed - all BYOK machines are same size (1 CPU, 2GB)

/**
 * Provision a phone number for users upgrading to calling-enabled plans.
 * Non-fatal: logs errors but doesn't fail the webhook.
 */
async function provisionPhoneForPlan(userId: string, plan: string): Promise<void> {
  if (!canUsePhone(plan)) return;

  try {
    // Check if user already has a number
    const existing = await db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.userId, userId),
    });

    if (existing) {
      console.log(`[stripe] User ${userId} already has phone number ${existing.phoneNumber}`);
      return;
    }

    // 1. Provision Twilio number (prefer 725 Vegas area code)
    console.log(`[stripe] Provisioning phone number for user ${userId} (plan: ${plan})`);
    const { phoneNumber, sid } = await provisionPhoneNumber("725");

    // 2. Import to Bland
    const imported = await importNumberToBland(phoneNumber);

    // 3. Configure inbound with default prompt
    if (imported) {
      await configureInboundNumber(phoneNumber, {
        prompt: `You are a helpful AI assistant. You answer phone calls on behalf of your user.
Be friendly, professional, and helpful. If someone is calling for the user, take a message 
including their name, what it's regarding, and a callback number. Keep responses concise and natural.`,
        firstSentence: "Hello, you've reached an AI assistant. How can I help you?",
      });
    }

    // 4. Save to database
    await db.insert(phoneNumbers).values({
      userId,
      phoneNumber,
      twilioSid: sid,
      blandImported: imported,
      agentName: "AI Assistant",
      voiceId: "6277266e-01eb-44c6-b965-438566ef7076", // Alexandra
      inboundPrompt: "You are a helpful AI assistant...",
      inboundFirstSentence: "Hello, you've reached an AI assistant. How can I help you?",
    });

    console.log(`[stripe] Provisioned phone ${phoneNumber} for user ${userId}`);

  } catch (error) {
    console.error(`[stripe] Failed to provision phone for ${userId}:`, error);
    // Non-fatal - user can contact support
  }
}

/**
 * Release a user's phone number when downgrading from calling-enabled plans.
 * Non-fatal.
 */
async function releasePhoneForPlan(userId: string, newPlan: string): Promise<void> {
  if (canUsePhone(newPlan)) return; // Still on calling plan

  try {
    const userPhone = await db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.userId, userId),
    });

    if (!userPhone) return;

    // Don't actually release the Twilio number yet - keep it reserved for 30 days
    // in case they re-upgrade. Just log it.
    console.log(`[stripe] User ${userId} downgraded from calling plan. Phone ${userPhone.phoneNumber} retained for now.`);
  } catch (error) {
    console.error(`[stripe] Error checking phone release for ${userId}:`, error);
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
          
          // Provision phone number for calling-enabled plans (pro/power only)
          await provisionPhoneForPlan(clerkUserId, plan);
          
          console.log(`[stripe] Upgraded user ${clerkUserId} to ${plan}`);

          // Track subscription in GA4
          trackServerEvent(clerkUserId, 'subscription_started', {
            plan,
            value: Number(session.amount_total || 0) / 100,
            currency: session.currency || 'usd',
          });

          // Send subscription started email + update audience
          if (session.customer_email) {
            await sendSubscriptionStarted(session.customer_email, plan);
            await updateContactPlan(session.customer_email, plan);
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

          // Detect plan change via subscription metadata (set by /api/upgrade)
          // or by checking if price changed via previous_attributes
          const currentPriceId = subscription.items.data[0]?.price?.id;
          const previousAttributes = (event.data as any).previous_attributes || {};
          const previousPriceId = previousAttributes?.items?.data?.[0]?.price?.id;
          const metadataChanged = previousAttributes?.metadata?.plan !== undefined;
          const planChanged = (previousPriceId && currentPriceId !== previousPriceId) || metadataChanged;

          // Determine new plan from subscription metadata or price lookup
          const newPlan = subscription.metadata?.plan || 'starter';

          const metadataUpdate: Record<string, any> = {
            subscriptionStatus: subscription.status,
          };

          if (planChanged) {
            metadataUpdate.plan = newPlan;
            console.log(`[stripe] Plan changed for ${clerkUserId}: price ${previousPriceId} → ${currentPriceId} (plan: ${newPlan})`);

            // Check if this is a downgrade — if so, preserve old plan limits until period ends
            const previousPlan = previousAttributes?.metadata?.plan || subscription.metadata?.previousPlan;
            const planRank: Record<string, number> = { free: 0, lite: 1, starter: 1, pro: 2, power: 3, business: 3 };
            const oldRank = planRank[previousPlan as string] ?? 1;
            const newRank = planRank[newPlan] ?? 1;
            
            if (oldRank > newRank && previousPlan) {
              // Downgrade: keep old plan limits until current period ends
              const periodEnd = (subscription as any).current_period_end as number;
              try {
                await db.update(machines)
                  .set({
                    effectivePlan: previousPlan as string,
                    effectivePlanUntil: periodEnd,
                    updatedAt: new Date(),
                  })
                  .where(eq(machines.userId, clerkUserId));
                console.log(`[stripe] Downgrade: preserving ${previousPlan} limits until ${new Date(periodEnd * 1000).toISOString()}`);
              } catch (e) {
                console.error(`[stripe] Failed to set effectivePlan:`, e);
              }
            } else {
              // Upgrade or same tier: clear any effective plan override
              try {
                await db.update(machines)
                  .set({ effectivePlan: null, effectivePlanUntil: null, updatedAt: new Date() })
                  .where(eq(machines.userId, clerkUserId));
              } catch (e) {
                console.error(`[stripe] Failed to clear effectivePlan:`, e);
              }
            }

            // Update machines table for rate limiting
            await updateMachinePlan(clerkUserId, newPlan);

            // Handle phone provisioning/release
            await provisionPhoneForPlan(clerkUserId, newPlan);
            await releasePhoneForPlan(clerkUserId, newPlan);

            // Track upgrade event
            trackServerEvent(clerkUserId, 'subscription_upgraded', {
              plan: newPlan,
              previous_price: previousPriceId,
              new_price: currentPriceId,
            });

            // Update email audience
            const customerEmail = (customer as Stripe.Customer).email;
            if (customerEmail) {
              await updateContactPlan(customerEmail, newPlan);
            }
          }

          await client.users.updateUserMetadata(clerkUserId, {
            publicMetadata: metadataUpdate,
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

          // Send cancellation email + update audience
          const customerEmail = (customer as Stripe.Customer).email;
          if (customerEmail) {
            await sendSubscriptionCanceled(customerEmail);
            await updateContactPlan(customerEmail, 'free');
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerEmail = invoice.customer_email;
        if (customerEmail) {
          await sendPaymentFailed(customerEmail);
          console.log(`[stripe] Sent payment failed email to ${customerEmail}`);
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
