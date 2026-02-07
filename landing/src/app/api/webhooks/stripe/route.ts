import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { sendSubscriptionStarted, sendSubscriptionCanceled, sendPaymentFailed } from '@/lib/email';
import { db } from '@/lib/db';
import { machines, machineEvents, phoneNumbers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { provisionPhoneNumber } from '@/lib/twilio';
import { importNumberToBland, configureInboundNumber } from '@/lib/bland';

// Initialize Stripe lazily to avoid build-time errors
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const FLY_API_BASE = "https://api.machines.dev/v1";

/**
 * Get memory allocation based on plan tier
 * Must match the logic in provision/route.ts
 * Starter: 2GB, Pro/Business: 4GB
 */
function getMemoryForPlan(plan: string): number {
  switch (plan) {
    case "pro":
    case "business":
      return 4096;
    default:
      return 2048;
  }
}

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

/**
 * Scale a user's Fly machine memory to match their plan tier.
 * Fetches current machine config, updates memory_mb, and logs the event.
 * Non-fatal: logs errors but doesn't fail the webhook.
 */
async function scaleMachineForPlan(userId: string, plan: string): Promise<void> {
  const targetMemory = getMemoryForPlan(plan);
  
  try {
    // Find user's machine
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    if (!machine || !machine.appName) {
      console.log(`[stripe] No machine found for ${userId}, skipping memory scale`);
      return;
    }

    // Get current machine config from Fly
    const statusRes = await fetch(`${FLY_API_BASE}/apps/${machine.appName}/machines/${machine.id}`, {
      headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
    });

    if (!statusRes.ok) {
      console.error(`[stripe] Failed to get machine status for ${machine.appName}/${machine.id}: ${statusRes.status} ${await statusRes.text()}`);
      await db.insert(machineEvents).values({
        machineId: machine.id,
        eventType: "scale_error",
        details: JSON.stringify({
          action: "get_status",
          plan,
          targetMemory,
          error: `HTTP ${statusRes.status}`,
        }),
      });
      return;
    }

    const flyMachine = await statusRes.json();
    const currentMemory = flyMachine.config?.guest?.memory_mb || 2048;

    if (currentMemory === targetMemory) {
      console.log(`[stripe] Machine ${machine.id} already at ${targetMemory}MB, no scale needed`);
      return;
    }

    console.log(`[stripe] Scaling machine ${machine.id} (${machine.appName}): ${currentMemory}MB → ${targetMemory}MB (plan: ${plan})`);

    // Update the machine config with new memory
    // We need to send the full config with only memory changed
    const updatedConfig = {
      ...flyMachine.config,
      guest: {
        ...flyMachine.config.guest,
        memory_mb: targetMemory,
      },
    };

    const updateRes = await fetch(`${FLY_API_BASE}/apps/${machine.appName}/machines/${machine.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ config: updatedConfig }),
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error(`[stripe] Failed to scale machine ${machine.id}: ${updateRes.status} ${errorText}`);
      await db.insert(machineEvents).values({
        machineId: machine.id,
        eventType: "scale_error",
        details: JSON.stringify({
          action: "update_memory",
          plan,
          fromMemory: currentMemory,
          targetMemory,
          error: `HTTP ${updateRes.status}: ${errorText.slice(0, 500)}`,
        }),
      });
      return;
    }

    console.log(`[stripe] Successfully scaled machine ${machine.id} to ${targetMemory}MB`);

    // Log success
    await db.insert(machineEvents).values({
      machineId: machine.id,
      eventType: "scaled",
      details: JSON.stringify({
        plan,
        fromMemory: currentMemory,
        toMemory: targetMemory,
        triggeredBy: "stripe-webhook",
      }),
    });
  } catch (error) {
    console.error(`[stripe] Error scaling machine for ${userId}:`, error);
    // Best-effort event logging
    try {
      const machine = await db.query.machines.findFirst({
        where: eq(machines.userId, userId),
      });
      if (machine) {
        await db.insert(machineEvents).values({
          machineId: machine.id,
          eventType: "scale_error",
          details: JSON.stringify({
            plan,
            targetMemory,
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    } catch { /* ignore logging failures */ }
  }
}

/**
 * Provision a phone number for users upgrading to calling-enabled plans.
 * Non-fatal: logs errors but doesn't fail the webhook.
 */
const PLANS_WITH_CALLING = ["pro", "business"];

async function provisionPhoneForPlan(userId: string, plan: string): Promise<void> {
  if (!PLANS_WITH_CALLING.includes(plan)) return;

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
  if (PLANS_WITH_CALLING.includes(newPlan)) return; // Still on calling plan

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
          
          // Scale machine memory to match plan tier (non-blocking, non-fatal)
          await scaleMachineForPlan(clerkUserId, plan);
          
          // Provision phone number for calling-enabled plans
          await provisionPhoneForPlan(clerkUserId, plan);
          
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
          
          // Scale machine memory down to starter tier
          await scaleMachineForPlan(clerkUserId, 'free');
          
          console.log(`[stripe] Canceled subscription for user ${clerkUserId}`);

          // Send cancellation email
          const customerEmail = (customer as Stripe.Customer).email;
          if (customerEmail) {
            await sendSubscriptionCanceled(customerEmail);
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
