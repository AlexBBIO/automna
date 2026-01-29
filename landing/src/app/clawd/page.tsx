'use client';

import { useState } from 'react';

export default function ClawdPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'clawd-page' }),
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-2 bg-orange-500/10 border border-orange-500/30 rounded-full text-orange-400 text-sm mb-6">
            For Moltbot Curious
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            Love the idea of{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">
              Moltbot
            </span>
            ?
          </h1>
          <p className="text-2xl text-slate-400 mb-4">
            But not the setup headaches?
          </p>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            <span className="text-orange-400 font-semibold">Automna</span> is Moltbot, reimagined for the cloud. 
            Same powerful AI agent. Zero server configuration.
          </p>
        </div>

        {/* Problem/Solution */}
        <div className="grid md:grid-cols-2 gap-8 mb-20">
          <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-8">
            <h3 className="text-red-400 font-semibold text-lg mb-4">😰 Self-hosting Moltbot means...</h3>
            <ul className="space-y-3 text-slate-400">
              <li className="flex items-start gap-3">
                <span className="text-red-400">✗</span>
                Setting up servers, Docker, reverse proxies
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400">✗</span>
                Managing API keys across multiple services
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400">✗</span>
                Configuring browser automation that actually works
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400">✗</span>
                Debugging connection issues at 2am
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400">✗</span>
                Security hardening you probably forgot about
              </li>
            </ul>
          </div>
          
          <div className="bg-green-950/20 border border-green-500/20 rounded-2xl p-8">
            <h3 className="text-green-400 font-semibold text-lg mb-4">✨ With Automna, you get...</h3>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <span><strong>One-click deploy</strong> — Your agent runs in minutes, not hours</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <span><strong>Pre-configured tools</strong> — Email, browser, calendar, all ready</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <span><strong>Secure cloud browsers</strong> — Browse the web without getting blocked</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <span><strong>Always online</strong> — Your agent works while you sleep</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400">✓</span>
                <span><strong>Enterprise security</strong> — Encrypted, isolated, audited</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Features */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything Moltbot does, plus more
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '🌐',
                title: 'Cloud Browser',
                desc: 'Secure browser instances that bypass CAPTCHAs and bot detection. Login to sites, scrape data, automate workflows.'
              },
              {
                icon: '📧',
                title: 'Email Integration',
                desc: 'Your agent gets its own email. Read, send, and manage messages automatically. No Gmail setup required.'
              },
              {
                icon: '🔄',
                title: 'Always Running',
                desc: 'Scheduled tasks, background monitoring, proactive notifications. Your agent never sleeps.'
              },
              {
                icon: '🔒',
                title: 'Isolated & Secure',
                desc: 'Each agent runs in its own secure container. Your data stays yours. SOC 2 compliant infrastructure.'
              },
              {
                icon: '🧠',
                title: 'Persistent Memory',
                desc: 'Your agent remembers everything. Context carries across sessions. True continuity.'
              },
              {
                icon: '🛠️',
                title: 'Extensible',
                desc: 'Add custom tools, connect APIs, install skills. Build exactly what you need.'
              },
            ].map((feature, i) => (
              <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            From zero to AI agent in 3 steps
          </h2>
          <div className="flex flex-col md:flex-row gap-8 justify-center">
            {[
              { step: '1', title: 'Sign up', desc: 'Create your account. No credit card required.' },
              { step: '2', title: 'Name your agent', desc: 'Give it a personality. Set your preferences.' },
              { step: '3', title: 'Start talking', desc: 'Discord, Telegram, WhatsApp — wherever you are.' },
            ].map((item, i) => (
              <div key={i} className="flex-1 text-center">
                <div className="w-12 h-12 rounded-full bg-orange-500 text-white font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-3xl p-12">
          <h2 className="text-3xl font-bold mb-4">
            Ready for AI that just works?
          </h2>
          <p className="text-slate-400 mb-8 max-w-xl mx-auto">
            Join the waitlist. We&apos;re onboarding Moltbot enthusiasts first.
          </p>
          
          {submitted ? (
            <div className="text-green-400 text-lg">
              ✓ You&apos;re on the list! We&apos;ll be in touch soon.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                className="px-8 py-3 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg font-semibold hover:from-orange-400 hover:to-amber-400 transition-all"
              >
                Join Waitlist
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-slate-500 text-sm">
          <p>
            Automna is built on open-source foundations. We contribute back.
          </p>
          <p className="mt-2">
            <a href="/" className="text-orange-400 hover:underline">Home</a>
            {' · '}
            <a href="/privacy" className="hover:underline">Privacy</a>
            {' · '}
            <a href="/terms" className="hover:underline">Terms</a>
          </p>
        </div>
      </div>
    </div>
  );
}
