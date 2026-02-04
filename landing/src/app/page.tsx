'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

// Conversation data for the animated demo
const conversationSteps = [
  { 
    role: 'you', 
    text: "Monitor Hacker News for posts about our competitor. When you find one trending, summarize it and email me. Check every hour."
  },
  { 
    role: 'agent', 
    text: "I'll monitor HN hourly for competitor mentions with 50+ points.",
    typing: true 
  },
  { 
    role: 'timestamp', 
    text: "3 hours later..." 
  },
  { 
    role: 'agent', 
    text: "Found: \"Acme Corp raises $50M Series B\" — 127 points, 89 comments.",
    typing: true 
  },
  { 
    role: 'agent', 
    text: "Analyzed sentiment from 89 comments. Mixed reception — users praise product but question valuation.",
    typing: true 
  },
  { 
    role: 'notification',
    text: "📧 Email summary ready for review"
  },
  { 
    role: 'agent', 
    text: "Awaiting your approval to send, or I can auto-send future alerts.",
    typing: true,
    highlight: true
  },
];

export default function Landing() {
  const [isVisible, setIsVisible] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [typingIndex, setTypingIndex] = useState(-1);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Animate conversation
  useEffect(() => {
    if (visibleMessages >= conversationSteps.length) {
      const resetTimer = setTimeout(() => {
        setVisibleMessages(0);
        setTypingIndex(-1);
      }, 6000);
      return () => clearTimeout(resetTimer);
    }

    const currentStep = conversationSteps[visibleMessages];
    const delay = currentStep?.role === 'timestamp' ? 1500 : 
                  currentStep?.role === 'notification' ? 1000 :
                  currentStep?.role === 'you' ? 2500 : 1800;

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

  const scrollToDemo = () => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
  };

  const prices = {
    monthly: { lite: 30, pro: 149, business: 299 },
    annual: { lite: 25, pro: 124, business: 249 }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white antialiased transition-colors">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-50/50 via-transparent to-violet-50/30 dark:from-purple-950/20 dark:via-transparent dark:to-indigo-950/10 pointer-events-none" />
      
      {/* Nav */}
      <nav className="relative z-10 container mx-auto px-6 py-5 flex justify-between items-center">
        <div className="text-xl font-semibold tracking-tight">
          <span className="text-purple-600 dark:text-purple-400">Auto</span>mna
        </div>
        <div className="flex items-center gap-4">
          <button onClick={scrollToDemo} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors hidden sm:block">
            How it works
          </button>
          <Link href="/sign-in" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
            Sign in
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="container mx-auto px-6 pt-12 pb-16 md:pt-20 md:pb-24">
          <div className={`max-w-3xl mx-auto text-center transform transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-100 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-medium mb-8">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-600 dark:bg-purple-500"></span>
              </span>
              Now in early access
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 leading-[1.1] tracking-tight text-zinc-900 dark:text-white">
              Your AI employee.
              <br />
              <span className="bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 dark:from-purple-400 dark:via-violet-400 dark:to-purple-500 bg-clip-text text-transparent">
                Always on. Always ready.
              </span>
            </h1>
            
            {/* Subheadline */}
            <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-8 max-w-xl mx-auto leading-relaxed">
              Delegate real work to an AI that browses, emails, codes, and executes—autonomously 
              or with your approval. Running 24/7 in the cloud.
            </p>

            {/* CTA */}
            <div className="max-w-lg mx-auto">
              <div className="flex flex-col sm:flex-row gap-3 mb-4 justify-center">
                <Link
                  href="/sign-up"
                  className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-200 dark:shadow-purple-500/25 hover:shadow-purple-300 dark:hover:shadow-purple-500/40 text-base whitespace-nowrap text-center"
                >
                  Get Started
                </Link>
              </div>
              
              {/* Secondary CTA + Trust signals */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm">
                <button 
                  onClick={scrollToDemo}
                  className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  See how it works
                </button>
                <span className="hidden sm:block text-zinc-300 dark:text-zinc-700">•</span>
                <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Your data stays private
                </span>
              </div>
            </div>
          </div>

          {/* Logo strip - Social proof */}
          <div className={`max-w-3xl mx-auto mt-16 transform transition-all duration-700 delay-100 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-center text-zinc-400 dark:text-zinc-600 text-xs uppercase tracking-wider mb-6">Trusted by teams at</p>
            <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4 opacity-50 dark:opacity-40">
              {['Acme Corp', 'TechFlow', 'DataSync', 'CloudNine', 'DevStack'].map((name) => (
                <span key={name} className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">{name}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Demo Section */}
        <section id="demo" className="container mx-auto px-6 py-16 md:py-24">
          <div className={`max-w-4xl mx-auto transform transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-zinc-900 dark:text-white">See it in action</h2>
              <p className="text-zinc-500 dark:text-zinc-400">Real task. Real autonomy. Real control.</p>
            </div>

            {/* Terminal-style demo - keep dark for contrast */}
            <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-800 p-5 md:p-8 shadow-2xl">
              {/* Terminal header */}
              <div className="flex items-center justify-between mb-5 pb-5 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                  </div>
                  <span className="text-zinc-500 text-sm">automna agent</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-emerald-400/80 text-xs font-medium">running 24/7</span>
                </div>
              </div>
              
              {/* Animated conversation */}
              <div className="space-y-4 font-mono text-sm min-h-[260px]">
                {conversationSteps.slice(0, visibleMessages).map((step, i) => (
                  <div 
                    key={i} 
                    className={`flex gap-3 animate-fadeIn ${step.role === 'timestamp' ? 'justify-center my-5' : ''} ${step.role === 'notification' ? 'justify-center my-3' : ''}`}
                  >
                    {step.role === 'timestamp' ? (
                      <span className="text-zinc-600 text-xs bg-zinc-800/50 px-3 py-1 rounded-full">
                        {step.text}
                      </span>
                    ) : step.role === 'notification' ? (
                      <span className="text-amber-400/90 text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
                        {step.text}
                      </span>
                    ) : (
                      <>
                        <span className={`shrink-0 ${step.role === 'you' ? 'text-purple-400' : 'text-emerald-400'}`}>
                          {step.role}:
                        </span>
                        <span className={step.highlight ? 'text-zinc-200' : step.role === 'you' ? 'text-zinc-200' : 'text-zinc-400'}>
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
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                  </div>
                )}
              </div>

              {/* Human in the loop callout */}
              <div className="mt-6 pt-5 border-t border-zinc-800 flex items-center justify-center gap-2 text-zinc-500 text-xs">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span>You control the level of autonomy. Review actions, or let it run fully autonomous.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Grid Features */}
        <section className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-zinc-900 dark:text-white">Everything an employee can do.</h2>
              <p className="text-zinc-500 dark:text-zinc-400">Except take vacation.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {/* Large feature - spans 2 cols */}
              <BentoCard 
                className="col-span-2 row-span-2"
                icon="🌐"
                title="Browse the Web"
                description="Navigate sites, fill forms, extract data, monitor pages. Full browser automation with residential proxies."
                large
              />
              
              {/* Regular features */}
              <BentoCard 
                icon="📧"
                title="Send Emails"
                description="Draft, send, and manage email on your behalf."
              />
              <BentoCard 
                icon="💻"
                title="Write Code"
                description="Generate, debug, and deploy code changes."
              />
              <BentoCard 
                icon="📁"
                title="Manage Files"
                description="Create, edit, organize your documents."
              />
              <BentoCard 
                icon="🔗"
                title="Use APIs"
                description="Connect to any service with REST/GraphQL."
              />
              
              {/* Wide feature - spans 2 cols */}
              <BentoCard 
                className="col-span-2"
                icon="🧠"
                title="Persistent Memory"
                description="Remembers your preferences, projects, and context. Picks up where you left off."
              />
              
              {/* More regular features */}
              <BentoCard 
                icon="💬"
                title="Multi-Channel"
                description="Discord, Telegram, WhatsApp, or web."
              />
              <BentoCard 
                icon="⏰"
                title="24/7 Uptime"
                description="Works while you sleep. Always available."
              />
            </div>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="container mx-auto px-6 py-16 md:py-24">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-zinc-900 dark:text-white">
                ChatGPT answers questions.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400">Automna gets things done.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6">
                <div className="text-zinc-400 dark:text-zinc-500 text-xs font-medium uppercase tracking-wider mb-5">Typical AI Chat</div>
                <ul className="space-y-3">
                  <ComparisonItem negative>Just a chat window</ComparisonItem>
                  <ComparisonItem negative>Forgets between sessions</ComparisonItem>
                  <ComparisonItem negative>Can&apos;t access files or web</ComparisonItem>
                  <ComparisonItem negative>You copy-paste output</ComparisonItem>
                  <ComparisonItem negative>Closes when you close tab</ComparisonItem>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-500/10 dark:to-violet-500/5 border border-purple-200 dark:border-purple-500/30 rounded-xl p-6">
                <div className="text-purple-600 dark:text-purple-400 text-xs font-medium uppercase tracking-wider mb-5">Automna Agent</div>
                <ul className="space-y-3">
                  <ComparisonItem>Executes real tasks</ComparisonItem>
                  <ComparisonItem>Persistent memory</ComparisonItem>
                  <ComparisonItem>Full web + file access</ComparisonItem>
                  <ComparisonItem>Saves work to your workspace</ComparisonItem>
                  <ComparisonItem>Runs 24/7 in the cloud</ComparisonItem>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="container mx-auto px-6 py-12">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-8 text-center shadow-sm">
              <p className="text-lg text-zinc-700 dark:text-zinc-300 mb-6 leading-relaxed">
                &quot;I set it to monitor 3 subreddits for mentions of our product. 
                Two days later it had compiled a report with sentiment analysis and 
                sent it to my Notion. I didn&apos;t touch anything.&quot;
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white font-medium">
                  M
                </div>
                <div className="text-left">
                  <div className="text-zinc-900 dark:text-white font-medium text-sm">Marcus Chen</div>
                  <div className="text-zinc-500 dark:text-zinc-400 text-xs">Founder, DevTools Startup</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-zinc-900 dark:text-white">Simple, transparent pricing</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">Start small. Scale when ready.</p>
              
              {/* Billing toggle */}
              <div className="inline-flex items-center gap-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-full p-1 shadow-sm">
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                    billingPeriod === 'monthly' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod('annual')}
                  className={`px-4 py-1.5 rounded-full text-sm transition-all flex items-center gap-2 ${
                    billingPeriod === 'annual' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Annual
                  <span className="text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">Save 17%</span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              <PricingCard
                tier="Lite"
                price={prices[billingPeriod].lite}
                period={billingPeriod}
                description="For trying it out"
                features={[
                  '1 AI agent',
                  'Web interface',
                  'Persistent memory',
                  'Bring your own API key',
                  'Community support',
                ]}
              />
              <PricingCard
                tier="Pro"
                price={prices[billingPeriod].pro}
                period={billingPeriod}
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
                price={prices[billingPeriod].business}
                period={billingPeriod}
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

            <p className="text-center text-zinc-500 dark:text-zinc-400 text-sm mt-6">
              All plans: AI usage billed separately (typically $5-50/mo). No surprises.
            </p>

            {/* FAQ Accordion */}
            <div className="max-w-2xl mx-auto mt-16">
              <h3 className="text-lg font-semibold text-center mb-6 text-zinc-900 dark:text-white">Frequently asked questions</h3>
              <div className="space-y-2">
                {[
                  { q: "What does 'bring your own API key' mean?", a: "You connect your own OpenAI/Anthropic API key. You pay them directly for AI usage, giving you full control over costs and models." },
                  { q: "How is this different from ChatGPT?", a: "ChatGPT is a chat interface. Automna is an autonomous agent that executes real tasks—browsing, emailing, coding—without you copy-pasting." },
                  { q: "Is my data private?", a: "Yes. Your agent runs in an isolated container. We never train on your data. You can self-host if needed." },
                  { q: "Can I control what it does autonomously?", a: "Absolutely. Set approval requirements for sensitive actions, or let it run fully autonomous. You decide." },
                ].map((faq, i) => (
                  <div key={i} className="border border-zinc-200 dark:border-zinc-800/50 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/50">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <span className="text-sm font-medium text-zinc-900 dark:text-white">{faq.q}</span>
                      <svg 
                        className={`w-4 h-4 text-zinc-400 transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedFaq === i && (
                      <div className="px-5 pb-4 text-sm text-zinc-600 dark:text-zinc-400">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="container mx-auto px-6 py-20 md:py-28">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-zinc-900 dark:text-white">
              Ready to delegate?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8">
              Start free. No credit card required.
            </p>

            <Link
              href="/sign-up"
              className="inline-block px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-200 dark:shadow-purple-500/25 text-base"
            >
              Get Started
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-200 dark:border-zinc-800/50 py-8 bg-zinc-50/50 dark:bg-transparent">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-zinc-400 dark:text-zinc-600 text-sm">© 2026 Automna</p>
            <div className="flex gap-6 text-zinc-500 dark:text-zinc-500 text-sm">
              <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BentoCard({ 
  icon, 
  title, 
  description, 
  className = '',
  large = false 
}: { 
  icon: string; 
  title: string; 
  description: string;
  className?: string;
  large?: boolean;
}) {
  return (
    <div className={`group bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 hover:border-zinc-300 dark:hover:border-zinc-700/60 hover:shadow-md dark:hover:bg-zinc-900/60 transition-all duration-200 ${className}`}>
      <div className={`${large ? 'text-3xl mb-4' : 'text-xl mb-2'}`}>{icon}</div>
      <h3 className={`font-semibold mb-1.5 text-zinc-900 dark:text-white ${large ? 'text-lg' : 'text-sm'}`}>{title}</h3>
      <p className={`text-zinc-500 dark:text-zinc-400 leading-relaxed ${large ? 'text-sm' : 'text-xs'}`}>{description}</p>
    </div>
  );
}

function PricingCard({ 
  tier, 
  price, 
  period,
  description, 
  features, 
  highlighted 
}: { 
  tier: string; 
  price: number;
  period: 'monthly' | 'annual';
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div className={`rounded-xl p-6 transition-all duration-200 ${
      highlighted 
        ? 'bg-gradient-to-b from-purple-50 to-violet-50 dark:from-purple-500/15 dark:to-violet-500/5 border-2 border-purple-300 dark:border-purple-500/40 shadow-xl shadow-purple-100 dark:shadow-purple-500/10 scale-[1.02]' 
        : 'bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700/50 hover:shadow-md'
    }`}>
      {highlighted && (
        <div className="text-purple-600 dark:text-purple-400 text-xs font-semibold mb-2 uppercase tracking-wide">Most Popular</div>
      )}
      <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">{tier}</h3>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-4">{description}</p>
      <div className="text-4xl font-bold mb-1 text-zinc-900 dark:text-white">
        ${price}<span className="text-base text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
      </div>
      {period === 'annual' && (
        <p className="text-emerald-600 dark:text-emerald-400 text-xs mb-4">Billed annually (${price * 12}/yr)</p>
      )}
      {period === 'monthly' && <div className="mb-4" />}
      <ul className="space-y-2.5">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
            <span className={`text-xs ${highlighted ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-400 dark:text-zinc-600'}`}>✓</span>
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
      <span className={`text-xs ${negative ? 'text-zinc-300 dark:text-zinc-600' : 'text-purple-600 dark:text-purple-400'}`}>
        {negative ? '✗' : '✓'}
      </span>
      <span className={negative ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-200'}>{children}</span>
    </li>
  );
}
