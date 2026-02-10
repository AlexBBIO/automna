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
    name: 'Lite',
    price: 20,
    annual: 16,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_LITE,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_LITE_ANNUAL,
    description: 'Experience the magic',
    tagline: 'Everything. Just a taste.',
    features: [
      'Full AI agent (Claude Opus)',
      'Dedicated phone number',
      'Personal email inbox',
      'All integrations',
      'Browser access',
      '50K credits/month',
      'Estimated: ~100 tasks/mo',
    ],
    footnote: 'Machine sleeps when idle',
    cta: 'Try for $20',
    ctaAnnual: 'Try for $16',
  },
  {
    name: 'Starter',
    price: 79,
    annual: 63,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL,
    description: 'Your always-on assistant',
    tagline: 'Never sleeps. Never forgets.',
    features: [
      'Full AI agent (Claude Opus)',
      'Dedicated phone number',
      'Personal email inbox',
      'All integrations',
      'Browser access',
      'Always-on (24/7 uptime)',
      'Proactive monitoring & alerts',
      'Long-term memory',
      '200K credits/month',
      'Estimated: ~400 tasks/mo',
    ],
    cta: 'Get Starter',
    ctaAnnual: 'Get Starter',
    popular: true,
  },
  {
    name: 'Pro',
    price: 149,
    annual: 119,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL,
    description: 'For power users',
    tagline: 'Built for heavy use.',
    features: [
      'Full AI agent (Claude Opus)',
      'Dedicated phone number',
      'Personal email inbox',
      'All integrations',
      'Browser access',
      'Always-on (24/7 uptime)',
      'Proactive monitoring & alerts',
      'Long-term memory',
      'Higher rate limits',
      'Custom skills',
      'Email support',
      '1M credits/month',
      'Estimated: ~2,000 tasks/mo',
    ],
    cta: 'Go Pro',
    ctaAnnual: 'Go Pro',
  },
  {
    name: 'Business',
    price: 299,
    annual: 239,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL,
    description: 'Unlimited power',
    tagline: 'For all-day, every-day use.',
    features: [
      'Full AI agent (Claude Opus)',
      'Dedicated phone number',
      'Personal email inbox',
      'All integrations',
      'Browser access',
      'Always-on (24/7 uptime)',
      'Proactive monitoring & alerts',
      'Long-term memory',
      'Highest rate limits',
      'Custom skills',
      'API access',
      'Analytics dashboard',
      'Dedicated support',
      '5M credits/month',
      'Estimated: ~10,000 tasks/mo',
    ],
    cta: 'Go Business',
    ctaAnnual: 'Go Business',
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
            <span className="font-semibold">Account created! 🎉</span> Pick a plan to activate your AI agent. It&apos;ll be ready in about 60 seconds.
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

function PricingCard({ plan, isAnnual, isSignedIn, loading, onCheckout }: {
  plan: typeof plans[0];
  isAnnual: boolean;
  isSignedIn: boolean;
  loading: string | null;
  onCheckout: (plan: typeof plans[0]) => void;
}) {
  const price = isAnnual ? plan.annual : plan.price;
  const cta = isAnnual ? plan.ctaAnnual : plan.cta;
  
  return (
    <div
      className={`relative rounded-2xl p-6 md:p-8 flex flex-col min-w-[280px] w-[85vw] md:w-auto snap-center ${
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
        <span className="text-4xl md:text-5xl font-bold">${price}</span>
        <span className="text-zinc-500 dark:text-gray-400 text-sm">/mo</span>
      </div>
      
      {isAnnual && (
        <p className="text-green-600 dark:text-green-400 text-xs mb-1">
          Save ${(plan.price - plan.annual!) * 12}/yr
        </p>
      )}
      
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
        {plan.footnote && (
          <li className="flex items-start gap-2 md:gap-3">
            <span className="text-yellow-500 dark:text-yellow-400 mt-0.5 flex-shrink-0 text-xs">⚡</span>
            <span className="text-zinc-400 dark:text-gray-500 text-xs md:text-sm italic">{plan.footnote}</span>
          </li>
        )}
      </ul>

      {isSignedIn ? (
        <button
          onClick={() => onCheckout(plan)}
          disabled={loading === plan.name || !plan.priceId}
          className={`w-full py-3 rounded-xl font-semibold transition-all text-sm md:text-base ${
            plan.popular
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white/10 dark:hover:bg-white/20 text-white'
          } disabled:opacity-50`}
        >
          {loading === plan.name ? 'Loading...' : cta}
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
            {cta}
          </button>
        </SignInButton>
      )}
    </div>
  );
}

export default function PricingPage() {
  const { isSignedIn } = useUser();
  const [loading, setLoading] = useState<string | null>(null);
  const [isAnnual, setIsAnnual] = useState(false);
  const pageLoadTime = useRef(Date.now());
  const hasTrackedView = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useTheme();

  // Auto-scroll to "Most Popular" card on mobile
  useEffect(() => {
    if (scrollRef.current && window.innerWidth < 768) {
      const popularIndex = plans.findIndex(p => p.popular);
      if (popularIndex >= 0) {
        const cards = scrollRef.current.children;
        if (cards[popularIndex]) {
          setTimeout(() => {
            (cards[popularIndex] as HTMLElement).scrollIntoView({
              behavior: 'smooth',
              inline: 'center',
              block: 'nearest',
            });
          }, 300);
        }
      }
    }
  }, []);

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
    const checkoutParams = {
      plan: plan.name.toLowerCase(),
      price: isAnnual ? plan.annual : plan.price,
      billing: isAnnual ? 'annual' : 'monthly',
      time_to_click_seconds: timeToClick,
    };
    track('pricing_checkout_started', checkoutParams);
    trackEvent('plan_selected', checkoutParams);
    
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: isAnnual ? plan.annualPriceId : plan.priceId,
          plan: plan.name.toLowerCase(),
          billing: isAnnual ? 'annual' : 'monthly',
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

      {/* Subscription Required Banner */}
      <Suspense fallback={null}>
        <SubscriptionBanner />
      </Suspense>

      {/* Header */}
      <main className="py-8 md:py-16">
        <div className="text-center mb-6 px-4 md:px-6">
          <h1 className="text-3xl md:text-6xl font-bold mb-3 md:mb-4">
            One agent. Your rules.
          </h1>
          <p className="text-base md:text-xl text-zinc-500 dark:text-gray-400 max-w-2xl mx-auto">
            Every plan gets the same core agent — Claude Opus, phone calls, email, integrations.
            Higher tiers add always-on uptime, memory, and more credits.
          </p>
        </div>

        {/* What every plan includes */}
        <div className="max-w-3xl mx-auto mb-8 md:mb-12 px-4 md:px-6">
          <div className="bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl md:rounded-2xl p-4 md:p-8">
            <h3 className="text-base md:text-xl font-bold mb-3 md:mb-4 text-center">What every plan includes</h3>
            <div className="grid grid-cols-4 gap-2 md:gap-4 text-center">
              <div className="p-1 md:p-3">
                <div className="text-xl md:text-2xl mb-1">🧠</div>
                <div className="text-zinc-700 dark:text-gray-300 font-medium text-xs md:text-sm">Claude Opus</div>
                <div className="text-zinc-400 dark:text-gray-500 text-xs hidden md:block">Latest model</div>
              </div>
              <div className="p-1 md:p-3">
                <div className="text-xl md:text-2xl mb-1">📞</div>
                <div className="text-zinc-700 dark:text-gray-300 font-medium text-xs md:text-sm">Phone</div>
                <div className="text-zinc-400 dark:text-gray-500 text-xs hidden md:block">Calls in & out</div>
              </div>
              <div className="p-1 md:p-3">
                <div className="text-xl md:text-2xl mb-1">📧</div>
                <div className="text-zinc-700 dark:text-gray-300 font-medium text-xs md:text-sm">Email</div>
                <div className="text-zinc-400 dark:text-gray-500 text-xs hidden md:block">Send & receive</div>
              </div>
              <div className="p-1 md:p-3">
                <div className="text-xl md:text-2xl mb-1">🌐</div>
                <div className="text-zinc-700 dark:text-gray-300 font-medium text-xs md:text-sm">Browser</div>
                <div className="text-zinc-400 dark:text-gray-500 text-xs hidden md:block">Research & browse</div>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly / Annual toggle */}
        <div className="flex justify-center items-center gap-3 mb-8 md:mb-12 px-4">
          <span className={`text-sm ${!isAnnual ? 'text-zinc-900 dark:text-white font-medium' : 'text-zinc-400 dark:text-gray-500'}`}>Monthly</span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              isAnnual ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-white/20'
            }`}
          >
            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${
              isAnnual ? 'translate-x-7' : 'translate-x-0.5'
            }`} />
          </button>
          <span className={`text-sm ${isAnnual ? 'text-zinc-900 dark:text-white font-medium' : 'text-zinc-400 dark:text-gray-500'}`}>
            Annual
            <span className="ml-1 text-green-600 dark:text-green-400 text-xs font-medium">Save 20%</span>
          </span>
        </div>

        {/* Pricing Cards - horizontal scroll on mobile, grid on desktop */}
        <div className="md:px-6">
          {/* Mobile: horizontal scroll */}
          <div
            ref={scrollRef}
            className="flex md:hidden gap-4 overflow-x-auto snap-x snap-mandatory px-4 pb-4 scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            {plans.map((plan) => (
              <PricingCard
                key={plan.name}
                plan={plan}
                isAnnual={isAnnual}
                isSignedIn={!!isSignedIn}
                loading={loading}
                onCheckout={handleCheckout}
              />
            ))}
          </div>

          {/* Desktop: grid */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {plans.map((plan) => (
              <PricingCard
                key={plan.name}
                plan={plan}
                isAnnual={isAnnual}
                isSignedIn={!!isSignedIn}
                loading={loading}
                onCheckout={handleCheckout}
              />
            ))}
          </div>
        </div>

        {/* Scroll hint on mobile */}
        <div className="flex md:hidden justify-center mt-4 gap-1.5">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                plan.popular ? 'bg-purple-500' : 'bg-zinc-300 dark:bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Lite callout */}
        <div className="mt-10 md:mt-16 max-w-3xl mx-auto text-center px-4 md:px-6">
          <p className="text-zinc-400 dark:text-gray-500 text-xs md:text-sm">
            Not sure yet? <span className="text-purple-600 dark:text-purple-400">Lite at ${isAnnual ? '16' : '20'}/mo</span> gives you the same core agent and tools,
            but runs on-demand (sleeps when idle) with lower limits. Upgrade anytime.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 md:mt-12 text-center px-4 md:px-6">
          <p className="text-zinc-500 dark:text-gray-400 text-sm">
            All plans include Claude AI. No API key needed.{' '}
            <Link href="/dashboard" className="text-purple-600 dark:text-purple-400 hover:underline">
              Start chatting →
            </Link>
          </p>
        </div>
      </main>

      {/* Hide scrollbar globally for the carousel */}
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
