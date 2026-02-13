'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useUser, SignInButton } from '@clerk/nextjs';
import { track } from '@vercel/analytics';
import { trackEvent } from '@/lib/analytics';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTheme, ThemeToggle } from '@/components/ThemeToggle';

const plans = [
  {
    name: 'Starter',
    price: 20,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_BYOK,
    description: 'Get started with your own AI agent',
    tagline: 'Bring your own Claude. We handle the rest.',
    features: [
      'Full AI agent (bring your own Claude)',
      'All integrations (Discord, Telegram, WhatsApp, web)',
      'Browser & web search',
      'Email (send/receive)',
      'Persistent memory',
    ],
    limitations: [
      'Machine sleeps when idle',
      'No phone calling',
      'No scheduled tasks',
    ],
    cta: 'Get Started — $20/mo',
  },
  {
    name: 'Pro',
    price: 30,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_BYOK,
    description: 'Always-on with full capabilities',
    tagline: 'Never sleeps. Never forgets.',
    features: [
      'Everything in Starter',
      'Always-on 24/7',
      'Phone calling (60 min/mo)',
      'Scheduled tasks & cron',
      'Custom skills',
      'File browser',
    ],
    limitations: [],
    cta: 'Go Pro — $30/mo',
    popular: true,
  },
  {
    name: 'Power',
    price: 40,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_POWER_BYOK,
    description: 'Unlimited power for heavy users',
    tagline: 'No limits. Full control.',
    features: [
      'Everything in Pro',
      'Phone calling (120 min/mo)',
      'API access',
      'Team sharing (+1 seat)',
    ],
    limitations: [],
    cta: 'Go Power — $40/mo',
  },
];

function SubscriptionBanner() {
  const searchParams = useSearchParams();
  const needsSubscription = searchParams.get('subscribe') === 'true';
  const isWelcome = searchParams.get('welcome') === 'true';
  const wasCanceled = searchParams.get('canceled') === 'true';

  useEffect(() => {
    if (wasCanceled) {
      track('pricing_checkout_canceled');
    }
  }, [wasCanceled]);
  
  if (wasCanceled) {
    return (
      <div className="container mx-auto px-4 md:px-6">
        <div className="bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-600/50 rounded-lg p-4 text-center">
          <p className="text-zinc-600 dark:text-zinc-300">
            No worries! Take your time. Pick a plan when you&apos;re ready.
          </p>
        </div>
      </div>
    );
  }

  if (isWelcome) {
    return (
      <div className="container mx-auto px-4 md:px-6">
        <div className="bg-purple-50 dark:bg-purple-900/50 border border-purple-300 dark:border-purple-500/50 rounded-lg p-4 text-center">
          <p className="text-purple-800 dark:text-purple-200">
            <span className="font-semibold">Account created! 🎉</span> Pick a plan to get started. You&apos;ll connect your Claude account next.
          </p>
        </div>
      </div>
    );
  }
  
  if (!needsSubscription) return null;
  
  return (
    <div className="container mx-auto px-4 md:px-6">
      <div className="bg-purple-50 dark:bg-purple-900/50 border border-purple-300 dark:border-purple-500/50 rounded-lg p-4 text-center">
        <p className="text-purple-800 dark:text-purple-200">
          <span className="font-semibold">Choose a plan to get started.</span> Subscribe to access your personal AI agent.
        </p>
      </div>
    </div>
  );
}

function PricingCard({ plan, isSignedIn, loading, onCheckout, currentPlan }: {
  plan: typeof plans[0];
  isSignedIn: boolean;
  loading: string | null;
  onCheckout: (plan: typeof plans[0]) => void;
  currentPlan?: string | null;
}) {
  const planKey = plan.name.toLowerCase();
  const isCurrentPlan = currentPlan === planKey;
  const planOrder = ['starter', 'pro', 'power'];
  const isDowngrade = currentPlan && planOrder.indexOf(planKey) < planOrder.indexOf(currentPlan);
  const cta = isCurrentPlan
    ? 'Current Plan'
    : isDowngrade
    ? `Switch to ${plan.name}`
    : currentPlan && currentPlan !== 'free'
    ? `Upgrade to ${plan.name}`
    : plan.cta;
  
  return (
    <div
      className={`relative rounded-2xl p-6 md:p-8 flex flex-col ${
        plan.popular
          ? 'bg-gradient-to-b from-purple-100 to-purple-50 dark:from-purple-500/20 dark:to-purple-900/20 border-2 border-purple-500'
          : 'bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10'
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-purple-600 rounded-full text-xs font-medium whitespace-nowrap text-white">
          Most Popular
        </div>
      )}

      <div className="mb-3">
        <h3 className="text-xl md:text-2xl font-bold mb-1">{plan.name}</h3>
        <p className="text-zinc-500 dark:text-gray-400 text-xs md:text-sm">{plan.description}</p>
      </div>

      <div className="mb-1">
        <span className="text-4xl md:text-5xl font-bold">${plan.price}</span>
        <span className="text-zinc-500 dark:text-gray-400 text-sm">/mo</span>
      </div>
      
      <p className="text-purple-600 dark:text-purple-300 text-xs md:text-sm font-medium mb-4 md:mb-6">
        {plan.tagline}
      </p>

      <ul className="space-y-2 md:space-y-3 mb-4 md:mb-6 flex-grow">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 md:gap-3">
            <span className="text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0 text-xs">✓</span>
            <span className="text-zinc-600 dark:text-gray-300 text-xs md:text-sm">{feature}</span>
          </li>
        ))}
        {plan.limitations.map((limitation, i) => (
          <li key={`lim-${i}`} className="flex items-start gap-2 md:gap-3">
            <span className="text-zinc-400 dark:text-zinc-500 mt-0.5 flex-shrink-0 text-xs">—</span>
            <span className="text-zinc-400 dark:text-gray-500 text-xs md:text-sm">{limitation}</span>
          </li>
        ))}
      </ul>

      {isSignedIn ? (
        <button
          onClick={() => onCheckout(plan)}
          disabled={loading === plan.name || !plan.priceId || isCurrentPlan}
          className={`w-full py-3 rounded-xl font-semibold transition-all text-sm md:text-base ${
            isCurrentPlan
              ? 'bg-green-600/20 text-green-600 dark:text-green-400 border border-green-500/30 cursor-default'
              : plan.popular
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white/10 dark:hover:bg-white/20 text-white'
          } disabled:opacity-50`}
        >
          {loading === plan.name ? 'Processing...' : cta}
        </button>
      ) : (
        <SignInButton mode="modal">
          <button
            className={`w-full py-3 rounded-xl font-semibold transition-all text-sm md:text-base ${
              plan.popular
                ? 'bg-purple-600 hover:bg-purple-500 text-white'
                : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white/10 dark:hover:bg-white/20 text-white'
            }`}
          >
            {plan.cta}
          </button>
        </SignInButton>
      )}
    </div>
  );
}

export default function PricingPage() {
  const { isSignedIn, user } = useUser();
  const [loading, setLoading] = useState<string | null>(null);
  const pageLoadTime = useRef(Date.now());
  const hasTrackedView = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useTheme();

  useEffect(() => {
    if (hasTrackedView.current) return;
    hasTrackedView.current = true;
    const params = new URLSearchParams(window.location.search);
    const viewParams = {
      source: params.get('subscribe') === 'true' ? 'dashboard_redirect' : 'direct',
      signed_in: !!isSignedIn,
      referrer: document.referrer || 'none',
    };
    track('pricing_viewed', viewParams);
    trackEvent('pricing_viewed', viewParams);
  }, [isSignedIn]);

  const handleCheckout = async (plan: typeof plans[0]) => {
    if (!isSignedIn) return;
    setLoading(plan.name);

    const timeToClick = Math.round((Date.now() - pageLoadTime.current) / 1000);
    const planName = plan.name.toLowerCase();
    track('pricing_checkout_started', { plan: planName, price: plan.price, time_to_click_seconds: timeToClick });
    trackEvent('plan_selected', { plan: planName, price: plan.price });

    // Check if user already has a subscription (upgrade flow)
    const currentPlan = user?.publicMetadata?.plan as string | undefined;
    const hasSubscription = user?.publicMetadata?.stripeSubscriptionId as string | undefined;

    if (hasSubscription && currentPlan && currentPlan !== 'free') {
      try {
        const previewRes = await fetch('/api/upgrade?preview=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId: plan.priceId, plan: planName }),
        });
        const preview = await previewRes.json();

        if (preview.error) {
          if (preview.error.includes('Already on this plan')) {
            alert('You\'re already on this plan!');
            setLoading(null);
            return;
          }
          throw new Error(preview.error);
        }

        const confirmMsg = preview.isDowngrade
          ? `Switch to ${plan.name}? Changes take effect at next billing date.`
          : `Upgrade to ${plan.name}? Prorated charge of $${preview.totalDueNow.toFixed(2)} now.`;

        if (!confirm(confirmMsg)) {
          setLoading(null);
          return;
        }

        const upgradeRes = await fetch('/api/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId: plan.priceId, plan: planName }),
        });
        const result = await upgradeRes.json();

        if (result.success) {
          window.location.href = '/dashboard?success=true&upgraded=true';
        } else {
          throw new Error(result.error || 'Upgrade failed');
        }
      } catch (error) {
        console.error('Upgrade error:', error);
        alert('Something went wrong with the upgrade. Please try again.');
      }
    } else {
      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId: plan.priceId, plan: planName }),
        });
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } catch (error) {
        console.error('Checkout error:', error);
      }
    }
    
    setLoading(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-zinc-50 to-white dark:from-black dark:via-gray-950 dark:to-black text-zinc-900 dark:text-white transition-colors">
      {/* Nav */}
      <nav className="container mx-auto px-4 md:px-6 py-4 md:py-6 flex justify-between items-center">
        <Link href="/" className="text-xl md:text-2xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-purple-500 to-purple-700 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">Auto</span>mna
        </Link>
        <div className="flex items-center gap-3 md:gap-4 text-zinc-500 dark:text-gray-400 text-sm">
          <ThemeToggle />
          <Link href="/" className="hover:text-zinc-900 dark:hover:text-white transition">Home</Link>
          {isSignedIn ? (
            <Link href="/dashboard" className="px-3 py-1.5 md:px-4 md:py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition text-sm">
              Dashboard
            </Link>
          ) : (
            <Link href="/sign-in" className="px-3 py-1.5 md:px-4 md:py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition text-sm">
              Sign In
            </Link>
          )}
        </div>
      </nav>

      <Suspense fallback={null}>
        <SubscriptionBanner />
      </Suspense>

      <main className="py-8 md:py-16">
        <div className="text-center mb-8 md:mb-12 px-4 md:px-6">
          <h1 className="text-3xl md:text-6xl font-bold mb-3 md:mb-4">
            Bring your own Claude account.
          </h1>
          <p className="text-base md:text-xl text-zinc-500 dark:text-gray-400 max-w-2xl mx-auto mb-2">
            We handle everything else — infrastructure, tools, integrations, memory.
          </p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-xl mx-auto">
            Use your Claude subscription or API key. No markup on AI usage.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="px-4 md:px-6">
          {/* Mobile: horizontal scroll */}
          <div
            ref={scrollRef}
            className="flex md:hidden gap-4 overflow-x-auto snap-x snap-mandatory pb-4 scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            {plans.map((plan) => (
              <div key={plan.name} className="min-w-[280px] w-[85vw] snap-center">
                <PricingCard
                  plan={plan}
                  isSignedIn={!!isSignedIn}
                  loading={loading}
                  onCheckout={handleCheckout}
                  currentPlan={user?.publicMetadata?.plan as string | undefined}
                />
              </div>
            ))}
          </div>

          {/* Desktop: grid */}
          <div className="hidden md:grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <PricingCard
                key={plan.name}
                plan={plan}
                isSignedIn={!!isSignedIn}
                loading={loading}
                onCheckout={handleCheckout}
                currentPlan={user?.publicMetadata?.plan as string | undefined}
              />
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="mt-12 md:mt-20 max-w-3xl mx-auto px-4 md:px-6">
          <h2 className="text-xl md:text-2xl font-bold text-center mb-6">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <div className="bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">1️⃣</div>
              <h3 className="font-semibold mb-1">Pick a plan</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose your infrastructure tier</p>
            </div>
            <div className="bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">2️⃣</div>
              <h3 className="font-semibold mb-1">Connect Claude</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Use your Claude subscription or API key</p>
            </div>
            <div className="bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">3️⃣</div>
              <h3 className="font-semibold mb-1">Start chatting</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Your agent is ready in ~60 seconds</p>
            </div>
          </div>
        </div>

        <div className="mt-8 md:mt-12 text-center px-4 md:px-6">
          <p className="text-zinc-500 dark:text-gray-400 text-sm">
            Questions?{' '}
            <a href="mailto:hello@automna.ai" className="text-purple-600 dark:text-purple-400 hover:underline">
              hello@automna.ai
            </a>
          </p>
        </div>
      </main>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
