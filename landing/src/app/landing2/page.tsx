'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Conversation data for the animated demo
const conversationSteps = [
  { 
    role: 'you', 
    text: "Monitor Hacker News for posts about our competitor Acme Corp. When you find one with 50+ points, summarize it and email me. Check every hour."
  },
  { 
    role: 'agent', 
    text: "Got it. I'll monitor HN hourly for Acme Corp mentions with 50+ points.",
    typing: true 
  },
  { 
    role: 'timestamp', 
    text: "3 hours later..." 
  },
  { 
    role: 'agent', 
    text: "Found a trending post: \"Acme Corp raises $50M Series B\" — 127 points, 89 comments.",
    typing: true 
  },
  { 
    role: 'agent', 
    text: "Opening comments to analyze sentiment...",
    typing: true 
  },
  { 
    role: 'agent', 
    text: "Summary: Mixed reception. Users praise the product but question valuation. Top concerns: pricing changes, enterprise focus.",
    typing: true 
  },
  { 
    role: 'agent', 
    text: "Email sent to you@company.com with full breakdown. I'll keep monitoring.",
    typing: true,
    highlight: true
  },
];

export default function Landing2() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [typingIndex, setTypingIndex] = useState(-1);

  useEffect(() => {
    setIsVisible(true);
    fetch('/api/waitlist/count')
      .then(res => res.json())
      .then(data => setWaitlistCount(data.count || 0))
      .catch(() => setWaitlistCount(0));
  }, [submitted]);

  // Animate conversation
  useEffect(() => {
    if (visibleMessages >= conversationSteps.length) {
      // Reset after a pause
      const resetTimer = setTimeout(() => {
        setVisibleMessages(0);
        setTypingIndex(-1);
      }, 5000);
      return () => clearTimeout(resetTimer);
    }

    const currentStep = conversationSteps[visibleMessages];
    const delay = currentStep?.role === 'timestamp' ? 1500 : 
                  currentStep?.role === 'you' ? 2000 : 1800;

    // Show typing indicator before agent messages
    if (currentStep?.role === 'agent' && typingIndex < visibleMessages) {
      setTypingIndex(visibleMessages);
      const typingTimer = setTimeout(() => {
        setVisibleMessages(v => v + 1);
      }, 1200);
      return () => clearTimeout(typingTimer);
    }

    const timer = setTimeout(() => {
      setVisibleMessages(v => v + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [visibleMessages, typingIndex]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    
    try {
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
    <div className="min-h-screen bg-[#0A0A0B] text-white antialiased">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-950/20 via-transparent to-blue-950/10 pointer-events-none" />
      
      {/* Nav - Minimal, premium feel */}
      <nav className="relative z-10 container mx-auto px-6 py-5 flex justify-between items-center">
        <div className="text-xl font-semibold tracking-tight">
          <span className="text-purple-400">Auto</span>mna
        </div>
        <Link 
          href="/sign-in" 
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Sign in →
        </Link>
      </nav>

      {/* Hero Section - Above the fold optimization */}
      <main className="relative z-10">
        <section className="container mx-auto px-6 pt-12 pb-20 md:pt-20 md:pb-32">
          <div className={`max-w-3xl mx-auto text-center transform transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            
            {/* Trust Badge - Creates urgency + social proof */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium mb-8">
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              {waitlistCount > 0 ? `${waitlistCount} people ahead of you` : 'Limited early access spots'}
            </div>

            {/* Headline - Benefit-focused, transformation-oriented */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 leading-[1.1] tracking-tight">
              Stop managing tasks.
              <br />
              <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-purple-500 bg-clip-text text-transparent">
                Start delegating to AI.
              </span>
            </h1>
            
            {/* Subheadline - Clear value prop */}
            <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-xl mx-auto leading-relaxed">
              Your own autonomous AI agent. Browses the web, manages files, 
              runs code, and works 24/7. Ready in 60 seconds.
            </p>

            {/* Primary CTA - High contrast, action-oriented */}
            {!submitted ? (
              <div className="max-w-md mx-auto">
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="flex-1 px-4 py-3.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.07] transition-all text-base"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-all disabled:opacity-50 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 text-base whitespace-nowrap"
                  >
                    {loading ? 'Joining...' : 'Get Early Access'}
                  </button>
                </form>
                <p className="text-gray-500 text-sm mt-4">
                  No credit card required • Starting at $30/mo
                </p>
              </div>
            ) : (
              <div className="max-w-md mx-auto bg-gradient-to-r from-purple-500/10 to-violet-500/10 border border-purple-500/20 rounded-xl p-6">
                <div className="text-3xl mb-3">🎉</div>
                <p className="text-lg font-medium text-white mb-1">You&apos;re in!</p>
                <p className="text-gray-400 text-sm">We&apos;ll email you when it&apos;s your turn.</p>
              </div>
            )}
          </div>

          {/* Product Demo - Animated conversation */}
          <div className={`max-w-4xl mx-auto mt-16 md:mt-20 transform transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="bg-gradient-to-b from-gray-900/80 to-gray-950/80 rounded-xl border border-gray-800/50 p-4 md:p-6 shadow-2xl backdrop-blur-sm">
              {/* Terminal header */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-800/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                </div>
                <span className="text-gray-500 text-xs ml-2">automna agent</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-emerald-400/70 text-xs">always on</span>
                </div>
              </div>
              
              {/* Animated conversation */}
              <div className="space-y-3 font-mono text-sm min-h-[220px]">
                {conversationSteps.slice(0, visibleMessages).map((step, i) => (
                  <div 
                    key={i} 
                    className={`flex gap-3 animate-fadeIn ${step.role === 'timestamp' ? 'justify-center my-4' : ''}`}
                  >
                    {step.role === 'timestamp' ? (
                      <span className="text-gray-600 text-xs bg-gray-800/50 px-3 py-1 rounded-full">
                        {step.text}
                      </span>
                    ) : (
                      <>
                        <span className={`shrink-0 ${step.role === 'you' ? 'text-purple-400' : 'text-emerald-400'}`}>
                          {step.role}:
                        </span>
                        <span className={step.highlight ? 'text-emerald-300' : step.role === 'you' ? 'text-gray-200' : 'text-gray-400'}>
                          {step.text}
                        </span>
                      </>
                    )}
                  </div>
                ))}
                
                {/* Typing indicator */}
                {typingIndex >= 0 && typingIndex >= visibleMessages && visibleMessages < conversationSteps.length && (
                  <div className="flex gap-3 animate-fadeIn">
                    <span className="text-emerald-400 shrink-0">agent:</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof Bar */}
        <section className="border-y border-gray-800/50 bg-gray-900/20">
          <div className="container mx-auto px-6 py-8">
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 text-center">
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">24/7</div>
                <div className="text-gray-500 text-sm mt-0.5">Always running</div>
              </div>
              <div className="w-px h-8 bg-gray-800 hidden md:block" />
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">60s</div>
                <div className="text-gray-500 text-sm mt-0.5">To deploy</div>
              </div>
              <div className="w-px h-8 bg-gray-800 hidden md:block" />
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">100%</div>
                <div className="text-gray-500 text-sm mt-0.5">Private</div>
              </div>
              <div className="w-px h-8 bg-gray-800 hidden md:block" />
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">$30</div>
                <div className="text-gray-500 text-sm mt-0.5">Starting price</div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem/Solution Section */}
        <section className="container mx-auto px-6 py-20 md:py-28">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                ChatGPT answers questions.
                <br />
                <span className="text-gray-500">Automna gets things done.</span>
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Problem */}
              <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-6">
                <div className="text-gray-500 text-sm font-medium mb-4">TYPICAL AI CHAT</div>
                <ul className="space-y-3">
                  <ComparisonItem negative>Just a chat window</ComparisonItem>
                  <ComparisonItem negative>Forgets everything between sessions</ComparisonItem>
                  <ComparisonItem negative>Can&apos;t access your files or tools</ComparisonItem>
                  <ComparisonItem negative>You copy-paste the output</ComparisonItem>
                  <ComparisonItem negative>Closes when you close the tab</ComparisonItem>
                </ul>
              </div>

              {/* Solution */}
              <div className="bg-gradient-to-br from-purple-500/10 to-violet-500/5 border border-purple-500/20 rounded-xl p-6">
                <div className="text-purple-400 text-sm font-medium mb-4">AUTOMNA AGENT</div>
                <ul className="space-y-3">
                  <ComparisonItem>Executes real tasks autonomously</ComparisonItem>
                  <ComparisonItem>Persistent memory across sessions</ComparisonItem>
                  <ComparisonItem>Full file system and web access</ComparisonItem>
                  <ComparisonItem>Saves work directly to your workspace</ComparisonItem>
                  <ComparisonItem>Runs 24/7 in the cloud</ComparisonItem>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid - Benefit-focused */}
        <section className="container mx-auto px-6 py-20 md:py-28">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Everything you need.
                <br />
                <span className="text-gray-500">Nothing you don&apos;t.</span>
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              <FeatureCard
                icon="⚡"
                title="Real Execution"
                description="Browse websites, manage files, run scripts, deploy apps. Not just chat."
              />
              <FeatureCard
                icon="🌐"
                title="Always Available"
                description="Lives in the cloud. Works while you sleep. Responds in seconds."
              />
              <FeatureCard
                icon="🔒"
                title="Completely Private"
                description="Your own isolated instance. Your API key. We never see your data."
              />
              <FeatureCard
                icon="🧠"
                title="Persistent Memory"
                description="Remembers your preferences, projects, and context across sessions."
              />
              <FeatureCard
                icon="💬"
                title="Multi-Channel"
                description="Discord, Telegram, WhatsApp, or web. Talk to your agent anywhere."
              />
              <FeatureCard
                icon="🚀"
                title="Ship Apps"
                description="Your agent can build and deploy web apps. Idea to URL in minutes."
              />
            </div>
          </div>
        </section>

        {/* Pricing - 3-tier with middle highlighted */}
        <section className="container mx-auto px-6 py-20 md:py-28">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple pricing</h2>
              <p className="text-gray-400">Start small. Scale when you need to.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
              <PricingCard
                tier="Lite"
                price="$30"
                description="Try it out"
                features={[
                  '1 AI agent',
                  'Web interface',
                  'Persistent memory',
                  'BYOK only',
                  'Community support',
                ]}
              />
              <PricingCard
                tier="Pro"
                price="$149"
                description="For power users"
                features={[
                  '1 AI agent',
                  'All integrations',
                  'App deployment',
                  'Priority support',
                  'API access',
                ]}
                highlighted
              />
              <PricingCard
                tier="Business"
                price="$299"
                description="For teams"
                features={[
                  '3 AI agents',
                  'Team workspace',
                  'Advanced analytics',
                  'Dedicated support',
                  'Custom integrations',
                ]}
              />
            </div>

            <p className="text-center text-gray-500 text-sm mt-8">
              All plans: Bring your own API key. Usage typically $5-50/mo depending on use.
            </p>
          </div>
        </section>

        {/* Final CTA - Repeat form */}
        <section className="container mx-auto px-6 py-20 md:py-28">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to delegate?
            </h2>
            <p className="text-gray-400 mb-8">
              Join the waitlist. Limited spots for early access.
            </p>

            {!submitted ? (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="flex-1 px-4 py-3.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.07] transition-all text-base"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-all disabled:opacity-50 shadow-lg shadow-purple-500/20 text-base whitespace-nowrap"
                >
                  {loading ? 'Joining...' : 'Get Early Access'}
                </button>
              </form>
            ) : (
              <p className="text-purple-400 text-lg font-medium">You&apos;re on the list! ✓</p>
            )}
          </div>
        </section>
      </main>

      {/* Footer - Minimal */}
      <footer className="relative z-10 border-t border-gray-800/50 py-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-600 text-sm">© 2026 Automna</p>
            <div className="flex gap-6 text-gray-500 text-sm">
              <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="group bg-gray-900/30 border border-gray-800/50 rounded-xl p-5 hover:border-gray-700/50 hover:bg-gray-900/50 transition-all duration-200">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-base font-semibold mb-1.5">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function PricingCard({ 
  tier, 
  price, 
  description, 
  features, 
  highlighted 
}: { 
  tier: string; 
  price: string; 
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div className={`rounded-xl p-6 transition-all duration-200 ${
      highlighted 
        ? 'bg-gradient-to-b from-purple-500/15 to-violet-500/5 border-2 border-purple-500/40 shadow-xl shadow-purple-500/10 scale-[1.02]' 
        : 'bg-gray-900/30 border border-gray-800/50 hover:border-gray-700/50'
    }`}>
      {highlighted && (
        <div className="text-purple-400 text-xs font-semibold mb-2 uppercase tracking-wide">Most Popular</div>
      )}
      <h3 className="text-xl font-semibold">{tier}</h3>
      <p className="text-gray-500 text-sm mb-4">{description}</p>
      <div className="text-4xl font-bold mb-5">
        {price}<span className="text-base text-gray-500 font-normal">/mo</span>
      </div>
      <ul className="space-y-2.5">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2.5 text-gray-300 text-sm">
            <span className={`text-xs ${highlighted ? 'text-purple-400' : 'text-gray-600'}`}>✓</span>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonItem({ children, negative }: { children: React.ReactNode; negative?: boolean }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className={`text-xs ${negative ? 'text-gray-600' : 'text-purple-400'}`}>
        {negative ? '○' : '✓'}
      </span>
      <span className={negative ? 'text-gray-400' : 'text-gray-200'}>{children}</span>
    </li>
  );
}
