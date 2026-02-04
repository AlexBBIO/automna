import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import Stripe from 'stripe';

// Initialize Stripe lazily to avoid build-time errors
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

// Price IDs - these will be created in Stripe dashboard
// For now, we'll create them dynamically or use price lookup
const PRICES = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  business: process.env.STRIPE_PRICE_BUSINESS,
};

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

    // Check if user already has a Stripe customer ID
    let customerId = user.publicMetadata?.stripeCustomerId as string | undefined;

    const stripe = getStripe();

    if (!customerId) {
      // Create a new customer
      const customer = await stripe.customers.create({
        email: user.emailAddresses[0]?.emailAddress,
        metadata: {
          clerkUserId: userId,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://automna.ai'}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://automna.ai'}/pricing?canceled=true`,
      metadata: {
        clerkUserId: userId,
        plan: plan || 'starter',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
