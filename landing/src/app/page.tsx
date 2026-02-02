'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [typingIndex, setTypingIndex] = useState(-1);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

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

  const scrollToDemo = () => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
  };

  const prices = {
    monthly: { lite: 30, pro: 149, business: 299 },
    annual: { lite: 25, pro: 124, business: 249 }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-50/50 via-transparent to-violet-50/30 pointer-events-none" />
      
      {/* Nav */}
      <nav className="relative z-10 container mx-auto px-6 py-5 flex justify-between items-center">
        <div className="text-xl font-semibold tracking-tight">
          <span className="text-purple-600">Auto</span>mna
        </div>
        <div className="flex items-center gap-6">
          <button onClick={scrollToDemo} className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors hidden sm:block">
            How it works
          </button>
          <Link href="/sign-in" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            Sign in
          </Link>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="container mx-auto px-6 pt-12 pb-16 md:pt-20 md:pb-24">
          <div className={`max-w-3xl mx-auto text-center transform transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-100 border border-purple-200 text-purple-700 text-xs font-medium mb-8">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-600"></span>
              </span>
              {waitlistCount > 0 ? `${waitlistCount.toLocaleString()} on the waitlist` : 'Early access now open'}
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 leading-[1.1] tracking-tight text-zinc-900">
              Your AI employee.
              <br />
              <span className="bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 bg-clip-text text-transparent">
                Always on. Always ready.
              </span>
            </h1>
            
            {/* Subheadline */}
            <p className="text-lg md:text-xl text-zinc-600 mb-8 max-w-xl mx-auto leading-relaxed">
              Delegate real work to an AI that browses, emails, codes, and executes—autonomously 
              or with your approval. Running 24/7 in the cloud.
            </p>

            {/* Dual CTA */}
            {!submitted ? (
              <div className="max-w-lg mx-auto">
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-4">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="flex-1 px-4 py-3.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all text-base shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 shadow-lg shadow-purple-200 hover:shadow-purple-300 text-base whitespace-nowrap"
                  >
                    {loading ? 'Joining...' : 'Get Early Access'}
                  </button>
                </form>
                
                {/* Secondary CTA + Trust signals */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm">
                  <button 
                    onClick={scrollToDemo}
                    className="text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    See how it works
                  </button>
                  <span className="hidden sm:block text-zinc-300">•</span>
                  <span className="text-zinc-500 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Your data stays private
                  </span>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 rounded-xl p-6">
                <div className="text-3xl mb-3">🎉</div>
                <p className="text-lg font-medium text-zinc-900 mb-1">You&apos;re #{waitlistCount + 1} on the list!</p>
                <p className="text-zinc-500 text-sm mb-4">We&apos;ll email you when it&apos;s your turn.</p>
                <div className="text-xs text-zinc-400">
                  Want to move up? Share with friends who&apos;d love this.
                </div>
              </div>
            )}
          </div>

          {/* Logo strip - Social proof */}
          <div className={`max-w-3xl mx-auto mt-16 transform transition-all duration-700 delay-100 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-center text-zinc-400 text-xs uppercase tracking-wider mb-6">Trusted by teams at</p>
            <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4 opacity-50">
              {['Acme Corp', 'TechFlow', 'DataSync', 'CloudNine', 'DevStack'].map((name) => (
                <span key={name} className="text-zinc-500 font-medium text-sm">{name}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Demo Section */}
        <section id="demo" className="container mx-auto px-6 py-16 md:py-24">
          <div className={`max-w-4xl mx-auto transform transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-zinc-900">See it in action</h2>
              <p className="text-zinc-500">Real task. Real autonomy. Real control.</p>
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
        <section className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-zinc-900">Everything an employee can do.</h2>
              <p className="text-zinc-500">Except take vacation.</p>
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
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-zinc-900">
                ChatGPT answers questions.
              </h2>
              <p className="text-zinc-500">Automna gets things done.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-6">
                <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-5">Typical AI Chat</div>
                <ul className="space-y-3">
                  <ComparisonItem negative>Just a chat window</ComparisonItem>
                  <ComparisonItem negative>Forgets between sessions</ComparisonItem>
                  <ComparisonItem negative>Can&apos;t access files or web</ComparisonItem>
                  <ComparisonItem negative>You copy-paste output</ComparisonItem>
                  <ComparisonItem negative>Closes when you close tab</ComparisonItem>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-xl p-6">
                <div className="text-purple-600 text-xs font-medium uppercase tracking-wider mb-5">Automna Agent</div>
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
            <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center shadow-sm">
              <p className="text-lg text-zinc-700 mb-6 leading-relaxed">
                &quot;I set it to monitor 3 subreddits for mentions of our product. 
                Two days later it had compiled a report with sentiment analysis and 
                sent it to my Notion. I didn&apos;t touch anything.&quot;
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white font-medium">
                  M
                </div>
                <div className="text-left">
                  <div className="text-zinc-900 font-medium text-sm">Marcus Chen</div>
                  <div className="text-zinc-500 text-xs">Founder, DevTools Startup</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-zinc-900">Simple, transparent pricing</h2>
              <p className="text-zinc-500 mb-6">Start small. Scale when ready.</p>
              
              {/* Billing toggle */}
              <div className="inline-flex items-center gap-3 bg-white border border-zinc-200 rounded-full p-1 shadow-sm">
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                    billingPeriod === 'monthly' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod('annual')}
                  className={`px-4 py-1.5 rounded-full text-sm transition-all flex items-center gap-2 ${
                    billingPeriod === 'annual' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Annual
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Save 17%</span>
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

            <p className="text-center text-zinc-500 text-sm mt-6">
              All plans: AI usage billed separately (typically $5-50/mo). No surprises.
            </p>

            {/* FAQ Accordion */}
            <div className="max-w-2xl mx-auto mt-16">
              <h3 className="text-lg font-semibold text-center mb-6 text-zinc-900">Frequently asked questions</h3>
              <div className="space-y-2">
                {[
                  { q: "What does 'bring your own API key' mean?", a: "You connect your own OpenAI/Anthropic API key. You pay them directly for AI usage, giving you full control over costs and models." },
                  { q: "How is this different from ChatGPT?", a: "ChatGPT is a chat interface. Automna is an autonomous agent that executes real tasks—browsing, emailing, coding—without you copy-pasting." },
                  { q: "Is my data private?", a: "Yes. Your agent runs in an isolated container. We never train on your data. You can self-host if needed." },
                  { q: "Can I control what it does autonomously?", a: "Absolutely. Set approval requirements for sensitive actions, or let it run fully autonomous. You decide." },
                ].map((faq, i) => (
                  <div key={i} className="border border-zinc-200 rounded-lg overflow-hidden bg-white">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-zinc-50 transition-colors"
                    >
                      <span className="text-sm font-medium text-zinc-900">{faq.q}</span>
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
                      <div className="px-5 pb-4 text-sm text-zinc-600">
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
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-zinc-900">
              Ready to delegate?
            </h2>
            <p className="text-zinc-500 mb-8">
              Join {waitlistCount > 0 ? `${waitlistCount.toLocaleString()}+ others` : 'the waitlist'}. Limited early access spots.
            </p>

            {!submitted ? (
              <>
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-6">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="flex-1 px-4 py-3.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all text-base shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 shadow-lg shadow-purple-200 text-base whitespace-nowrap"
                  >
                    {loading ? 'Joining...' : 'Get Early Access'}
                  </button>
                </form>
                
                {/* SSO options */}
                <div className="flex items-center justify-center gap-4">
                  <span className="text-zinc-400 text-sm">or continue with</span>
                  <button className="flex items-center gap-2 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-700 hover:bg-zinc-100 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-700 hover:bg-zinc-100 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google
                  </button>
                </div>
              </>
            ) : (
              <p className="text-purple-600 text-lg font-medium">You&apos;re on the list! ✓</p>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-200 py-8 bg-zinc-50/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-zinc-400 text-sm">© 2026 Automna</p>
            <div className="flex gap-6 text-zinc-500 text-sm">
              <Link href="/privacy" className="hover:text-zinc-900 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-zinc-900 transition-colors">Terms</Link>
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
    <div className={`group bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 hover:shadow-md transition-all duration-200 ${className}`}>
      <div className={`${large ? 'text-3xl mb-4' : 'text-xl mb-2'}`}>{icon}</div>
      <h3 className={`font-semibold mb-1.5 text-zinc-900 ${large ? 'text-lg' : 'text-sm'}`}>{title}</h3>
      <p className={`text-zinc-500 leading-relaxed ${large ? 'text-sm' : 'text-xs'}`}>{description}</p>
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
        ? 'bg-gradient-to-b from-purple-50 to-violet-50 border-2 border-purple-300 shadow-xl shadow-purple-100 scale-[1.02]' 
        : 'bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-md'
    }`}>
      {highlighted && (
        <div className="text-purple-600 text-xs font-semibold mb-2 uppercase tracking-wide">Most Popular</div>
      )}
      <h3 className="text-xl font-semibold text-zinc-900">{tier}</h3>
      <p className="text-zinc-500 text-sm mb-4">{description}</p>
      <div className="text-4xl font-bold mb-1 text-zinc-900">
        ${price}<span className="text-base text-zinc-400 font-normal">/mo</span>
      </div>
      {period === 'annual' && (
        <p className="text-emerald-600 text-xs mb-4">Billed annually (${price * 12}/yr)</p>
      )}
      {period === 'monthly' && <div className="mb-4" />}
      <ul className="space-y-2.5">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2.5 text-zinc-700 text-sm">
            <span className={`text-xs ${highlighted ? 'text-purple-600' : 'text-zinc-400'}`}>✓</span>
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
      <span className={`text-xs ${negative ? 'text-zinc-300' : 'text-purple-600'}`}>
        {negative ? '✗' : '✓'}
      </span>
      <span className={negative ? 'text-zinc-400' : 'text-zinc-700'}>{children}</span>
    </li>
  );
}
