/**
 * POST /api/user/credits/purchase — Buy a credit pack via Stripe checkout
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { CREDIT_PACKS } from '@/lib/db/schema';
import type { CreditPackId } from '@/lib/db/schema';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { packId } = await request.json();
    const pack = CREDIT_PACKS.find(p => p.id === packId);
    if (!pack) {
      return NextResponse.json({ error: 'Invalid credit pack' }, { status: 400 });
    }

    const stripe = getStripe();
    let customerId = user.publicMetadata?.stripeCustomerId as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.emailAddresses[0]?.emailAddress,
        metadata: { clerkUserId: userId },
      });
      customerId = customer.id;

      // Persist stripeCustomerId in Clerk so future flows don't create duplicates
      const { clerkClient: getClerk } = await import('@clerk/nextjs/server');
      const client = await getClerk();
      await client.users.updateUserMetadata(userId, {
        publicMetadata: { ...user.publicMetadata, stripeCustomerId: customerId },
      }).catch(err => console.warn('[credits/purchase] Failed to update Clerk metadata:', err));
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: pack.priceCents,
          product_data: {
            name: `Automna ${pack.label}`,
            description: `${pack.label} for AI usage`,
          },
        },
        quantity: 1,
      }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://automna.ai'}/dashboard?credits=purchased`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://automna.ai'}/dashboard`,
      metadata: {
        clerkUserId: userId,
        type: 'credit_purchase',
        packId: pack.id,
        credits: String(pack.credits),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[credits/purchase] Error:', error);
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
  }
}
