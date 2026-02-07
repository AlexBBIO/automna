'use client';

import { useState, Suspense } from 'react';
import { useUser, SignInButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const plans = [
  {
    name: 'Starter',
    price: 79,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
    description: 'Get started',
    features: [
      'Your own AI agent',
      'Web chat + 1 integration',
      'Browser access',
      'Personal email inbox',
      '500K tokens/month',
    ],
    cta: 'Start with Starter',
  },
  {
    name: 'Pro',
    price: 149,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    description: 'For power users',
    features: [
      'Everything in Starter',
      'All integrations',
      '2M tokens/month',
      'Unlimited memory',
      'Custom skills',
      'Email support',
    ],
    cta: 'Go Pro',
    popular: true,
  },
  {
    name: 'Business',
    price: 299,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS,
    description: 'For teams',
    features: [
      'Everything in Pro',
      'Team workspace',
      '10M tokens/month',
      'API access',
      'Analytics dashboard',
      'Dedicated support',
    ],
    cta: 'Go Business',
  },
];

function SubscriptionBanner() {
  const searchParams = useSearchParams();
  const needsSubscription = searchParams.get('subscribe') === 'true';
  const wasCanceled = searchParams.get('canceled') === 'true';
  
  if (wasCanceled) {
    return (
      <div className="container mx-auto px-6">
        <div className="bg-zinc-800/50 border border-zinc-600/50 rounded-lg p-4 text-center">
          <p className="text-zinc-300">
            No worries! Take your time. Pick a plan when you&apos;re ready.
          </p>
        </div>
      </div>
    );
  }
  
  if (!needsSubscription) return null;
  
  return (
    <div className="container mx-auto px-6">
      <div className="bg-purple-900/50 border border-purple-500/50 rounded-lg p-4 text-center">
        <p className="text-purple-200">
          <span className="font-semibold">Choose a plan to get started.</span> Subscribe to access your personal AI agent.
        </p>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const { isSignedIn, user } = useUser();
  const [loading, setLoading] = useState<string | null>(null);

  const handleCheckout = async (plan: typeof plans[0]) => {
    if (!isSignedIn) return;
    
    setLoading(plan.name);
    
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan.priceId,
          plan: plan.name.toLowerCase(),
        }),
      });

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Checkout error:', error);
    }
    
    setLoading(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      {/* Nav */}
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
        </Link>
        <div className="flex items-center gap-6 text-gray-400 text-sm">
          <Link href="/" className="hover:text-white transition">Home</Link>
          {isSignedIn ? (
            <Link href="/dashboard" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition">
              Dashboard
            </Link>
          ) : (
            <Link href="/sign-in" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition">
              Sign In
            </Link>
          )}
        </div>
      </nav>

      {/* Subscription Required Banner */}
      <Suspense fallback={null}>
        <SubscriptionBanner />
      </Suspense>

      {/* Header */}
      <main className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include your own AI agent running 24/7.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 ${
                plan.popular
                  ? 'bg-gradient-to-b from-purple-500/20 to-purple-900/20 border-2 border-purple-500'
                  : 'bg-white/5 border border-white/10'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-purple-600 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-gray-400">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-bold">${plan.price}</span>
                <span className="text-gray-400">/month</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-green-400 mt-1">✓</span>
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              {isSignedIn ? (
                <button
                  onClick={() => handleCheckout(plan)}
                  disabled={loading === plan.name || !plan.priceId}
                  className={`w-full py-3 rounded-xl font-semibold transition-all ${
                    plan.popular
                      ? 'bg-purple-600 hover:bg-purple-500 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  } disabled:opacity-50`}
                >
                  {loading === plan.name ? 'Loading...' : plan.cta}
                </button>
              ) : (
                <SignInButton mode="modal">
                  <button
                    className={`w-full py-3 rounded-xl font-semibold transition-all ${
                      plan.popular
                        ? 'bg-purple-600 hover:bg-purple-500 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    Sign in to Subscribe
                  </button>
                </SignInButton>
              )}
            </div>
          ))}
        </div>

        {/* FAQ or additional info */}
        <div className="mt-20 text-center">
          <p className="text-gray-400">
            All plans include Claude AI. No API key needed.{' '}
            <Link href="/dashboard" className="text-purple-400 hover:underline">
              Start chatting →
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
