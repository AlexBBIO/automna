import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import Stripe from 'stripe';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await currentUser();
    const customerId = user?.publicMetadata?.stripeCustomerId as string | undefined;
    const subscriptionId = user?.publicMetadata?.stripeSubscriptionId as string | undefined;

    if (!customerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    const stripe = getStripe();
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://automna.ai'}/setup/connect`;

    // If we have a subscription ID, deep-link to the update flow
    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: returnUrl,
    };

    if (subscriptionId) {
      sessionParams.flow_data = {
        type: 'subscription_update' as any,
        subscription_update: {
          subscription: subscriptionId,
        },
      };
    }

    const session = await stripe.billingPortal.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[portal] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create portal session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
