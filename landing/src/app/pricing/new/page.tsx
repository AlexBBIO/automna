'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useUser, SignInButton } from '@clerk/nextjs';
import { track } from '@vercel/analytics';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const plans = [
  {
    name: 'Lite',
    price: 20,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_LITE,
    description: 'Experience the magic',
    tagline: 'Everything. Just a taste.',
    features: [
      'Full AI agent (Claude Opus)',
      'Phone number + calling',
      'Personal email inbox',
      'All integrations',
      'Browser access',
      '50K tokens/month',
    ],
    footnote: 'Machine sleeps when idle',
    cta: 'Try for $20',
  },
  {
    name: 'Starter',
    price: 79,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
    description: 'Your always-on assistant',
    tagline: 'Never sleeps. Never forgets.',
    features: [
      'Everything in Lite',
      'Always-on (24/7 uptime)',
      'Proactive monitoring & alerts',
      'Long-term memory',
      '200K tokens/month',
    ],
    cta: 'Get Starter',
    popular: true,
  },
  {
    name: 'Pro',
    price: 149,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    description: 'For power users',
    tagline: 'Built for heavy use.',
    features: [
      'Everything in Starter',
      '1M tokens/month',
      'Priority responses',
      'Custom skills',
      'Advanced scheduling',
      'Email support',
    ],
    cta: 'Go Pro',
  },
  {
    name: 'Business',
    price: 299,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS,
    description: 'Unlimited power',
    tagline: 'For all-day, every-day use.',
    features: [
      'Everything in Pro',
      '5M tokens/month',
      'API access',
      'Analytics dashboard',
      'Dedicated support',
      'Priority infrastructure',
    ],
    cta: 'Go Business',
  },
];

function SubscriptionBanner() {
  const searchParams = useSearchParams();
  const needsSubscription = searchParams.get('subscribe') === 'true';
  const wasCanceled = searchParams.get('canceled') === 'true';

  useEffect(() => {
    if (wasCanceled) {
      track('pricing_checkout_canceled');
    }
  }, [wasCanceled]);
  
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
  const pageLoadTime = useRef(Date.now());
  const hasTrackedView = useRef(false);

  useEffect(() => {
    if (hasTrackedView.current) return;
    hasTrackedView.current = true;

    const params = new URLSearchParams(window.location.search);
    track('pricing_viewed', {
      source: params.get('subscribe') === 'true' ? 'dashboard_redirect' : 'direct',
      signed_in: !!isSignedIn,
      referrer: document.referrer || 'none',
      variant: 'new_4tier',
    });
  }, [isSignedIn]);

  useEffect(() => {
    const handleLeave = () => {
      const timeOnPage = Math.round((Date.now() - pageLoadTime.current) / 1000);
      track('pricing_exit', {
        time_on_page_seconds: timeOnPage,
        signed_in: !!isSignedIn,
      });
    };

    window.addEventListener('beforeunload', handleLeave);
    return () => window.removeEventListener('beforeunload', handleLeave);
  }, [isSignedIn]);

  const handleCheckout = async (plan: typeof plans[0]) => {
    if (!isSignedIn) return;
    
    setLoading(plan.name);

    const timeToClick = Math.round((Date.now() - pageLoadTime.current) / 1000);
    track('pricing_checkout_started', {
      plan: plan.name.toLowerCase(),
      price: plan.price,
      time_to_click_seconds: timeToClick,
    });
    
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
        track('pricing_checkout_error', { plan: plan.name.toLowerCase(), error: 'no_url' });
      }
    } catch (error) {
      console.error('Checkout error:', error);
      track('pricing_checkout_error', { plan: plan.name.toLowerCase(), error: 'fetch_failed' });
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
        <div className="text-center mb-6">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            One agent. Your rules.
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Every plan gets the full experience — Claude Opus, phone calls, email, integrations.
            <br />
            Pick how much you want to use it.
          </p>
        </div>

        {/* "Same AI everywhere" badge */}
        <div className="flex justify-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-sm">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            Same AI on every plan — no feature gating
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 flex flex-col ${
                plan.popular
                  ? 'bg-gradient-to-b from-purple-500/20 to-purple-900/20 border-2 border-purple-500'
                  : 'bg-white/5 border border-white/10'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-purple-600 rounded-full text-sm font-medium whitespace-nowrap">
                  Most Popular
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                <p className="text-gray-400 text-sm">{plan.description}</p>
              </div>

              <div className="mb-2">
                <span className="text-5xl font-bold">${plan.price}</span>
                <span className="text-gray-400">/mo</span>
              </div>
              
              <p className="text-purple-300 text-sm font-medium mb-6 min-h-[20px]">
                {plan.tagline}
              </p>

              <ul className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </li>
                ))}
                {plan.footnote && (
                  <li className="flex items-start gap-3">
                    <span className="text-yellow-400 mt-0.5 flex-shrink-0">⚡</span>
                    <span className="text-gray-500 text-sm italic">{plan.footnote}</span>
                  </li>
                )}
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

        {/* Comparison highlight */}
        <div className="mt-16 max-w-3xl mx-auto">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h3 className="text-xl font-bold mb-4 text-center">What every plan includes</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
              <div className="p-3">
                <div className="text-2xl mb-1">🧠</div>
                <div className="text-gray-300 font-medium">Claude Opus</div>
                <div className="text-gray-500">Latest model</div>
              </div>
              <div className="p-3">
                <div className="text-2xl mb-1">📞</div>
                <div className="text-gray-300 font-medium">Phone Number</div>
                <div className="text-gray-500">Calls in & out</div>
              </div>
              <div className="p-3">
                <div className="text-2xl mb-1">📧</div>
                <div className="text-gray-300 font-medium">Email Inbox</div>
                <div className="text-gray-500">Send & receive</div>
              </div>
              <div className="p-3">
                <div className="text-2xl mb-1">🌐</div>
                <div className="text-gray-300 font-medium">Browser</div>
                <div className="text-gray-500">Research & browse</div>
              </div>
            </div>
          </div>
        </div>

        {/* Lite callout */}
        <div className="mt-8 max-w-3xl mx-auto text-center">
          <p className="text-gray-500 text-sm">
            Not sure yet? <span className="text-purple-400">Lite at $20/mo</span> gives you the full experience.
            <br />
            Same AI, same capabilities — just fewer tokens. Upgrade anytime.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
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
