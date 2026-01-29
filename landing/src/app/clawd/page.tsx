'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function ClawdPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);

  useEffect(() => {
    fetch('/api/waitlist/count')
      .then(res => res.json())
      .then(data => setWaitlistCount(data.count || 0))
      .catch(() => setWaitlistCount(0));
  }, [submitted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'clawd-page' }),
      });
      if (response.ok) setSubmitted(true);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      {/* Nav */}
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
        </Link>
        <div className="flex gap-6 text-gray-400 text-sm">
          <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition">Terms</Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="container mx-auto px-6 pt-8 pb-24">
        <div className="max-w-4xl mx-auto text-center">
          {/* Mascot */}
          <div className="mb-8">
            <Image 
              src="/lobster-mascot.png" 
              alt="Clawdbot mascot" 
              width={180} 
              height={180}
              className="mx-auto drop-shadow-[0_0_30px_rgba(168,85,247,0.4)]"
            />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            For Moltbot Enthusiasts
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-[1.1] tracking-tight">
            Love{' '}
            <span className="bg-gradient-to-r from-purple-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Moltbot
            </span>
            ?
            <br />
            <span className="text-gray-400 text-4xl md:text-5xl">Hate the setup?</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            <span className="text-purple-400 font-semibold">Automna</span> is Moltbot, reimagined for the cloud. 
            Same powerful AI agent. Zero server configuration.
          </p>
        </div>

        {/* Problem/Solution */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-20">
          <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-8">
            <h3 className="text-red-400 font-semibold text-lg mb-4">😰 Self-hosting means...</h3>
            <ul className="space-y-3 text-gray-400">
              <li className="flex items-start gap-3">
                <span className="text-red-400 mt-1">✗</span>
                Setting up servers, Docker, reverse proxies
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400 mt-1">✗</span>
                Managing API keys across services
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400 mt-1">✗</span>
                Configuring browser automation that works
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400 mt-1">✗</span>
                Debugging connection issues at 2am
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400 mt-1">✗</span>
                Security hardening (that you probably forgot)
              </li>
            </ul>
          </div>
          
          <div className="bg-green-950/20 border border-green-500/20 rounded-2xl p-8">
            <h3 className="text-green-400 font-semibold text-lg mb-4">✨ With Automna...</h3>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong>One-click deploy</strong> — Running in minutes</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong>Pre-configured tools</strong> — Email, browser, calendar ready</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong>Cloud browsers</strong> — No bot detection issues</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong>Always online</strong> — Works while you sleep</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong>Enterprise security</strong> — Encrypted, isolated</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-5xl mx-auto mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything Moltbot does, <span className="text-purple-400">plus more</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '🌐',
                title: 'Cloud Browser',
                desc: 'Secure browser instances that bypass CAPTCHAs and bot detection.'
              },
              {
                icon: '📧',
                title: 'Email Integration',
                desc: 'Your agent gets its own email. Read, send, manage automatically.'
              },
              {
                icon: '🔄',
                title: 'Always Running',
                desc: 'Scheduled tasks, monitoring, proactive notifications. Never sleeps.'
              },
              {
                icon: '🔒',
                title: 'Isolated & Secure',
                desc: 'Each agent runs in its own secure container. Your data stays yours.'
              },
              {
                icon: '🧠',
                title: 'Persistent Memory',
                desc: 'Your agent remembers everything. True continuity across sessions.'
              },
              {
                icon: '🛠️',
                title: 'Extensible',
                desc: 'Add custom tools, connect APIs, install skills from the hub.'
              },
            ].map((feature, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-purple-500/30 transition-colors">
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="max-w-3xl mx-auto mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            From zero to AI agent in <span className="text-purple-400">3 steps</span>
          </h2>
          <div className="flex flex-col md:flex-row gap-8 justify-center">
            {[
              { step: '1', title: 'Sign up', desc: 'Create your account. No credit card.' },
              { step: '2', title: 'Name your agent', desc: 'Give it a personality.' },
              { step: '3', title: 'Start talking', desc: 'Discord, Telegram, wherever.' },
            ].map((item, i) => (
              <div key={i} className="flex-1 text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold text-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/25">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready for AI that <span className="text-purple-400">just works</span>?
          </h2>
          <p className="text-gray-400 mb-8">
            Join the waitlist. We&apos;re onboarding Moltbot enthusiasts first.
          </p>
          
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
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded-xl font-semibold transition-all disabled:opacity-50 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                >
                  {loading ? 'Joining...' : 'Get Early Access'}
                </button>
              </form>
              <p className="text-gray-500 text-sm mt-4">
                Join {waitlistCount > 0 ? `${waitlistCount} ${waitlistCount === 1 ? 'other' : 'others'}` : 'the waitlist'} · Starting at $30/month
              </p>
            </div>
          ) : (
            <div className="max-w-md mx-auto bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-8">
              <div className="text-4xl mb-4">🦞</div>
              <h3 className="text-xl font-semibold mb-2">You&apos;re on the list!</h3>
              <p className="text-gray-400">We&apos;ll email you when it&apos;s your turn.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-20 text-gray-500 text-sm">
          <p>Built on open-source foundations. We contribute back.</p>
          <p className="mt-4">
            <Link href="/" className="text-purple-400 hover:underline">Home</Link>
            {' · '}
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            {' · '}
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
