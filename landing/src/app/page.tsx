'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Home() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);

  useEffect(() => {
    fetch('/api/waitlist/count')
      .then(res => res.json())
      .then(data => setWaitlistCount(data.count || 0))
      .catch(() => setWaitlistCount(0));
  }, [submitted]); // Refetch after submission

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    
    try {
      // Loops.so API integration
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      if (response.ok) {
        setSubmitted(true);
      }
    } catch (error) {
      console.error('Waitlist error:', error);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      {/* Nav */}
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="text-2xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
        </div>
        <div className="flex items-center gap-6 text-gray-400 text-sm">
          <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition">Terms</Link>
          <Link href="/sign-in" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition">
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero - Single focused CTA */}
      <main className="container mx-auto px-6 pt-16 pb-24">
        <div className="max-w-4xl mx-auto text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Now accepting early access signups
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-[1.1] tracking-tight">
            Your own, private,<br />
            <span className="bg-gradient-to-r from-purple-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">fully autonomous</span><br />
            AI agent.
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-3 font-medium">
            Working in 60 seconds.
          </p>
          
          <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Not just another chatbot. An AI agent that actually executes tasks, manages your files, 
            automates workflows, and integrates with your tools — running 24/7 in the cloud.
          </p>

          {/* Single CTA - Waitlist Form */}
          {!submitted ? (
            <div className="max-w-md mx-auto">
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="flex-1 px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded-xl font-semibold transition-all disabled:opacity-50 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Joining...
                    </span>
                  ) : 'Get Early Access'}
                </button>
              </form>
              <p className="text-gray-500 text-sm mt-4">
                Join {waitlistCount > 0 ? `${waitlistCount} ${waitlistCount === 1 ? 'other' : 'others'}` : 'the waitlist'} · Starting at $30/month
              </p>
            </div>
          ) : (
            <div className="max-w-md mx-auto bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-8">
              <div className="text-4xl mb-4">🎉</div>
              <p className="text-xl font-semibold text-white mb-2">You&apos;re on the list!</p>
              <p className="text-gray-400">We&apos;ll email you when it&apos;s your turn. You&apos;re going to love this.</p>
            </div>
          )}
        </div>

        {/* Social Proof / Stats */}
        <div className="flex flex-wrap justify-center gap-8 md:gap-16 mt-20 text-center">
          <div>
            <div className="text-3xl md:text-4xl font-bold text-white">24/7</div>
            <div className="text-gray-400 text-sm mt-1">Always running</div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-bold text-white">60s</div>
            <div className="text-gray-400 text-sm mt-1">To deploy</div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-bold text-white">100%</div>
            <div className="text-gray-400 text-sm mt-1">Private & isolated</div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-bold text-white">$30</div>
            <div className="text-gray-400 text-sm mt-1">Starting price</div>
          </div>
        </div>

        {/* What it does - Visual demo section */}
        <div className="mt-32 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            More than chat. <span className="text-gray-400">Actual execution.</span>
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
            Your agent doesn&apos;t just answer questions — it gets things done.
          </p>

          {/* Demo mockup */}
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-gray-800 p-6 md:p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              <span className="text-gray-500 text-sm ml-4">automna agent</span>
            </div>
            <div className="space-y-4 font-mono text-sm">
              <div className="flex gap-3">
                <span className="text-purple-400">you:</span>
                <span className="text-gray-300">Research competitors and summarize in a doc</span>
              </div>
              <div className="flex gap-3">
                <span className="text-green-400">agent:</span>
                <span className="text-gray-400">Searching web for competitors... Found 12 results. Analyzing...</span>
              </div>
              <div className="flex gap-3">
                <span className="text-green-400">agent:</span>
                <span className="text-gray-400">Creating document: competitor-analysis.md</span>
              </div>
              <div className="flex gap-3">
                <span className="text-green-400">agent:</span>
                <span className="text-gray-300">Done. I&apos;ve created a 2,400 word analysis covering 8 competitors, their pricing, features, and market positioning. Saved to your workspace.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-32 max-w-5xl mx-auto">
          <FeatureCard
            icon="⚡"
            title="Execute, Don't Chat"
            description="Browse the web, manage files, run code, control integrations, deploy apps. Real actions, not just words."
          />
          <FeatureCard
            icon="🌐"
            title="Always On"
            description="Lives in the cloud, available 24/7. Works while you sleep. Responds instantly on Discord, Telegram, or web."
          />
          <FeatureCard
            icon="🔒"
            title="Private & Isolated"
            description="Your own dedicated instance. Your API key, your data, your control. We never see your conversations."
          />
          <FeatureCard
            icon="🧠"
            title="Persistent Memory"
            description="Remembers everything across sessions. Knows your preferences, your projects, your context."
          />
          <FeatureCard
            icon="🔧"
            title="Powerful Integrations"
            description="Discord, Telegram, WhatsApp, web. Pre-configured and ready. Connect your tools in minutes."
          />
          <FeatureCard
            icon="🚀"
            title="Build & Deploy Apps"
            description="Your agent can create web apps and deploy them live. From idea to URL in one conversation."
          />
        </div>

        {/* Comparison - Simplified */}
        <div className="mt-32 max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Why not just use ChatGPT?
          </h2>
          <p className="text-gray-400 text-center mb-12">
            Chat apps answer questions. Automna agents complete tasks.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-400 mb-4">Typical AI Chat</h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-center gap-3"><span className="text-gray-600">○</span> Chat interface only</li>
                <li className="flex items-center gap-3"><span className="text-gray-600">○</span> Forgets between sessions</li>
                <li className="flex items-center gap-3"><span className="text-gray-600">○</span> Can&apos;t access your tools</li>
                <li className="flex items-center gap-3"><span className="text-gray-600">○</span> You do the work</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-purple-300 mb-4">Automna Agent</h3>
              <ul className="space-y-3 text-gray-200">
                <li className="flex items-center gap-3"><span className="text-purple-400">✓</span> Executes real tasks</li>
                <li className="flex items-center gap-3"><span className="text-purple-400">✓</span> Persistent memory</li>
                <li className="flex items-center gap-3"><span className="text-purple-400">✓</span> Full integrations</li>
                <li className="flex items-center gap-3"><span className="text-purple-400">✓</span> Agent does the work</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Pricing - Clean and simple */}
        <div className="mt-32 max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
          <p className="text-gray-400 mb-12">Start small, scale when you need to.</p>
          
          <div className="grid md:grid-cols-4 gap-4">
            <PricingCard
              tier="Lite"
              price="$30"
              description="Try it out"
              features={['1 AI agent', 'Web interface', 'Persistent memory', 'BYOK only']}
            />
            <PricingCard
              tier="Starter"
              price="$79"
              description="For individuals"
              features={['1 AI agent', '1 integration', 'Email support', 'All features']}
            />
            <PricingCard
              tier="Pro"
              price="$149"
              description="For power users"
              features={['1 AI agent', 'All integrations', 'App hosting', 'Priority support']}
              highlighted
            />
            <PricingCard
              tier="Business"
              price="$299"
              description="For teams"
              features={['3 AI agents', 'Team workspace', 'API access', 'Dedicated support']}
            />
          </div>
          
          <p className="text-gray-500 text-sm mt-8">
            All plans: Bring your own API key (usage typically $5-50/mo depending on use)
          </p>
        </div>

        {/* Final CTA - Repeat the form */}
        <div className="mt-32 text-center max-w-xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-gray-400 mb-8">Join the waitlist. Limited spots for early access.</p>
          
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="flex-1 px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded-xl font-semibold transition-all disabled:opacity-50 shadow-lg shadow-purple-500/25"
              >
                {loading ? 'Joining...' : 'Get Early Access'}
              </button>
            </form>
          ) : (
            <p className="text-purple-400 text-lg">You&apos;re on the list! ✓</p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8 mt-20">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">© 2026 Automna. All rights reserved.</p>
            <div className="flex gap-6 text-gray-500 text-sm">
              <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition">Terms</Link>
              <Link href="/licenses" className="hover:text-white transition">Open Source</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="group bg-gray-900/30 border border-gray-800/50 rounded-2xl p-6 hover:border-purple-500/30 hover:bg-gray-900/50 transition-all duration-300">
      <div className="text-3xl mb-4 group-hover:scale-110 transition-transform duration-300">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function PricingCard({ tier, price, description, features, highlighted }: { 
  tier: string; 
  price: string; 
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-6 transition-all duration-300 ${
      highlighted 
        ? 'bg-gradient-to-b from-purple-500/20 to-pink-500/10 border-2 border-purple-500/50 scale-105 shadow-xl shadow-purple-500/10' 
        : 'bg-gray-900/30 border border-gray-800/50 hover:border-gray-700'
    }`}>
      {highlighted && <div className="text-purple-400 text-xs font-semibold mb-2">MOST POPULAR</div>}
      <h3 className="text-xl font-semibold">{tier}</h3>
      <p className="text-gray-400 text-sm mb-3">{description}</p>
      <div className="text-4xl font-bold mb-4">{price}<span className="text-lg text-gray-400 font-normal">/mo</span></div>
      <ul className="text-left space-y-2">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-gray-300 text-sm">
            <span className={highlighted ? 'text-purple-400' : 'text-gray-500'}>✓</span> {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}
