'use client';

import { useState } from 'react';

export default function Home() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // TODO: Connect to actual waitlist API (Loops, ConvertKit, or custom)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero Section */}
      <main className="container mx-auto px-6 pt-20 pb-32">
        <nav className="flex justify-between items-center mb-20">
          <div className="text-2xl font-bold">
            <span className="text-purple-400">Go</span>Agentik
          </div>
          <div className="text-gray-400 text-sm">
            Powered by Claude
          </div>
        </nav>

        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Your own, private,<br />
            <span className="text-purple-400">fully autonomous</span><br />
            AI agent.
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 mb-4">
            Working in 60 seconds.
          </p>
          
          <p className="text-lg text-gray-500 mb-12 max-w-2xl mx-auto">
            Not just chat. A Claude-powered agent that executes tasks, manages files, 
            automates workflows, and integrates with Discord, Telegram, and more.
          </p>

          {/* Waitlist Form */}
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="flex-1 px-6 py-4 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-4 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition disabled:opacity-50"
              >
                {loading ? 'Joining...' : 'Join Waitlist'}
              </button>
            </form>
          ) : (
            <div className="bg-gray-900 border border-purple-500 rounded-lg p-6 max-w-md mx-auto">
              <p className="text-purple-400 font-semibold">You&apos;re on the list!</p>
              <p className="text-gray-400 text-sm mt-2">We&apos;ll email you when it&apos;s your turn.</p>
            </div>
          )}
          
          <p className="text-gray-600 text-sm mt-4">
            Starting at $79/month · Bring your own Claude API key
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 max-w-5xl mx-auto">
          <FeatureCard
            icon="⚡"
            title="Execute, Don't Chat"
            description="Your agent doesn't just answer questions — it completes tasks. Browse the web, manage files, run code, deploy apps."
          />
          <FeatureCard
            icon="🌐"
            title="Always On"
            description="Lives in the cloud, available 24/7. Works while you sleep. Responds instantly on Discord, Telegram, or web."
          />
          <FeatureCard
            icon="🔒"
            title="Private & Secure"
            description="Your own isolated instance. Your API key, your data, your control. We never see your conversations."
          />
          <FeatureCard
            icon="🧠"
            title="Persistent Memory"
            description="Remembers everything across sessions. Your agent knows your preferences, your projects, your context."
          />
          <FeatureCard
            icon="🔧"
            title="Powerful Integrations"
            description="Discord, Telegram, WhatsApp, web chat. Pre-configured and ready to go. Connect in minutes."
          />
          <FeatureCard
            icon="🚀"
            title="Build & Deploy"
            description="Your agent can create web apps and deploy them instantly. From idea to live site in one conversation."
          />
        </div>

        {/* Comparison */}
        <div className="mt-32 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            More than chat. More than Claude Max.
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="py-4 px-4 text-gray-400 font-normal">Feature</th>
                  <th className="py-4 px-4 text-center text-gray-400 font-normal">ChatGPT/Claude Pro</th>
                  <th className="py-4 px-4 text-center text-gray-400 font-normal">Claude Max</th>
                  <th className="py-4 px-4 text-center text-purple-400 font-semibold">GoAgentik</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                <ComparisonRow feature="Chat" chatgpt={true} max={true} us={true} />
                <ComparisonRow feature="Execute tasks" chatgpt={false} max={true} us={true} />
                <ComparisonRow feature="Always on (cloud)" chatgpt={false} max={false} us={true} />
                <ComparisonRow feature="Pre-configured integrations" chatgpt={false} max={false} us={true} />
                <ComparisonRow feature="Zero setup" chatgpt={true} max={false} us={true} />
                <ComparisonRow feature="Build & deploy apps" chatgpt={false} max={false} us={true} />
                <ComparisonRow feature="Managed & maintained" chatgpt={true} max={false} us={true} />
              </tbody>
            </table>
          </div>
          
          <p className="text-center text-gray-500 mt-8">
            Claude Max gives you Claude Code on your machine.<br />
            GoAgentik gives you Claude Code in the cloud, fully managed, with integrations.
          </p>
        </div>

        {/* Pricing Preview */}
        <div className="mt-32 max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Simple Pricing</h2>
          <p className="text-gray-400 mb-12">Less than a human assistant. More capable than any chatbot.</p>
          
          <div className="grid md:grid-cols-3 gap-6">
            <PricingCard
              tier="Starter"
              price="$79"
              description="For individuals"
              features={['1 AI agent', 'Web chat interface', '1 integration (Discord or Telegram)', 'Persistent memory']}
            />
            <PricingCard
              tier="Pro"
              price="$149"
              description="For power users"
              features={['1 AI agent', 'All integrations', 'Priority support', 'Custom skills', 'App hosting']}
              highlighted
            />
            <PricingCard
              tier="Business"
              price="$299"
              description="For teams"
              features={['3 AI agents', 'Shared workspace', 'API access', 'Analytics', 'Dedicated support']}
            />
          </div>
          
          <p className="text-gray-500 text-sm mt-8">
            + Bring your own Anthropic API key (usage-based, typically $5-50/mo)
          </p>
        </div>

        {/* Final CTA */}
        <div className="mt-32 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to hire your AI agent?</h2>
          <p className="text-gray-400 mb-8">Join the waitlist. We&apos;re launching soon.</p>
          
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="flex-1 px-6 py-4 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-4 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition disabled:opacity-50"
              >
                {loading ? 'Joining...' : 'Join Waitlist'}
              </button>
            </form>
          ) : (
            <p className="text-purple-400">You&apos;re on the list! ✓</p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="container mx-auto px-6 text-center text-gray-500 text-sm">
          <p>© 2026 GoAgentik. Powered by <a href="https://github.com/clawdbot/clawdbot" className="text-gray-400 hover:text-white">Clawdbot</a>.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

function ComparisonRow({ feature, chatgpt, max, us }: { feature: string; chatgpt: boolean; max: boolean; us: boolean }) {
  return (
    <tr className="border-b border-gray-800">
      <td className="py-4 px-4">{feature}</td>
      <td className="py-4 px-4 text-center">{chatgpt ? '✓' : '—'}</td>
      <td className="py-4 px-4 text-center">{max ? '✓' : '—'}</td>
      <td className="py-4 px-4 text-center text-purple-400">{us ? '✓' : '—'}</td>
    </tr>
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
    <div className={`rounded-xl p-6 ${highlighted ? 'bg-purple-900/30 border-2 border-purple-500' : 'bg-gray-900 border border-gray-800'}`}>
      <h3 className="text-xl font-semibold">{tier}</h3>
      <p className="text-gray-400 text-sm mb-4">{description}</p>
      <div className="text-4xl font-bold mb-6">{price}<span className="text-lg text-gray-400">/mo</span></div>
      <ul className="text-left space-y-2">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-gray-300">
            <span className="text-purple-400">✓</span> {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}
