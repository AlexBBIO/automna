'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Step = 'api-key' | 'agent' | 'integrations' | 'deploy';

export default function SetupWizard() {
  const { user } = useUser();
  const router = useRouter();
  const [step, setStep] = useState<Step>('api-key');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [apiKeyValid, setApiKeyValid] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [personality, setPersonality] = useState('');
  const [timezone, setTimezone] = useState('America/Los_Angeles');
  const [discordToken, setDiscordToken] = useState('');
  const [telegramToken, setTelegramToken] = useState('');

  const validateApiKey = async () => {
    if (!apiKey.startsWith('sk-ant-')) {
      setError('API key should start with sk-ant-');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/setup/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      
      const data = await response.json();
      
      if (data.valid) {
        setApiKeyValid(true);
        setStep('agent');
      } else {
        setError(data.error || 'Invalid API key');
      }
    } catch (err) {
      setError('Failed to validate API key');
    }
    
    setLoading(false);
  };

  const handleDeploy = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/setup/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          agentName,
          personality,
          timezone,
          discordToken: discordToken || null,
          telegramToken: telegramToken || null,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        router.push('/dashboard?deployed=true');
      } else {
        setError(data.error || 'Deployment failed');
      }
    } catch (err) {
      setError('Failed to deploy agent');
    }
    
    setLoading(false);
  };

  const steps = [
    { id: 'api-key', label: 'API Key', num: 1 },
    { id: 'agent', label: 'Agent', num: 2 },
    { id: 'integrations', label: 'Integrations', num: 3 },
    { id: 'deploy', label: 'Deploy', num: 4 },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800 bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
          </Link>
          <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Progress */}
          <div className="flex items-center justify-between mb-12">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  i < currentStepIndex ? 'bg-green-500' :
                  i === currentStepIndex ? 'bg-purple-600' :
                  'bg-gray-700'
                }`}>
                  {i < currentStepIndex ? '✓' : s.num}
                </div>
                <span className={`ml-2 text-sm hidden sm:block ${
                  i === currentStepIndex ? 'text-white' : 'text-gray-500'
                }`}>
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={`w-12 sm:w-24 h-1 mx-2 ${
                    i < currentStepIndex ? 'bg-green-500' : 'bg-gray-700'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
              {error}
            </div>
          )}

          {/* Step 1: API Key */}
          {step === 'api-key' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-2">Connect Your API Key</h2>
              <p className="text-gray-400 mb-6">
                Your agent needs an Anthropic API key to think. We encrypt and store it securely.
              </p>
              
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Don&apos;t have one?{' '}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                    Get it from Anthropic →
                  </a>
                </p>
              </div>

              <button
                onClick={validateApiKey}
                disabled={loading || !apiKey}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? 'Validating...' : 'Continue'}
              </button>
            </div>
          )}

          {/* Step 2: Agent */}
          {step === 'agent' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-2">Name Your Agent</h2>
              <p className="text-gray-400 mb-6">
                Give your AI assistant a name and personality.
              </p>
              
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">
                  Agent Name *
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g., Atlas, Nova, Jarvis"
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">
                  Personality (optional)
                </label>
                <textarea
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder="Describe how your agent should behave... e.g., 'Be concise and professional' or 'Be friendly and use emojis'"
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="America/Los_Angeles">Pacific Time (LA)</option>
                  <option value="America/Denver">Mountain Time (Denver)</option>
                  <option value="America/Chicago">Central Time (Chicago)</option>
                  <option value="America/New_York">Eastern Time (NY)</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </select>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep('api-key')}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('integrations')}
                  disabled={!agentName}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Integrations */}
          {step === 'integrations' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-2">Connect Integrations</h2>
              <p className="text-gray-400 mb-6">
                Choose how you want to talk to your agent. Web chat is always available.
              </p>
              
              {/* Web Chat - Always enabled */}
              <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🌐</span>
                  <div>
                    <h3 className="font-semibold">Web Chat</h3>
                    <p className="text-sm text-gray-400">Always enabled — chat via your dashboard</p>
                  </div>
                  <span className="ml-auto text-green-400 text-sm">✓ Included</span>
                </div>
              </div>

              {/* Discord */}
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">💬</span>
                  <div>
                    <h3 className="font-semibold">Discord</h3>
                    <p className="text-sm text-gray-400">Chat with your agent in Discord</p>
                  </div>
                </div>
                <input
                  type="password"
                  value={discordToken}
                  onChange={(e) => setDiscordToken(e.target.value)}
                  placeholder="Bot token (optional)"
                  className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                />
                <p className="mt-2 text-xs text-gray-500">
                  <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                    Create a Discord bot →
                  </a>
                </p>
              </div>

              {/* Telegram */}
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">✈️</span>
                  <div>
                    <h3 className="font-semibold">Telegram</h3>
                    <p className="text-sm text-gray-400">Chat with your agent in Telegram</p>
                  </div>
                </div>
                <input
                  type="password"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="Bot token (optional)"
                  className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                />
                <p className="mt-2 text-xs text-gray-500">
                  <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                    Create a Telegram bot →
                  </a>
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep('agent')}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('deploy')}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Deploy */}
          {step === 'deploy' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <div className="text-6xl mb-4">🚀</div>
              <h2 className="text-2xl font-bold mb-2">Ready to Deploy</h2>
              <p className="text-gray-400 mb-8">
                Your agent <span className="text-purple-400 font-semibold">{agentName}</span> is ready to go live.
              </p>
              
              <div className="bg-gray-800/50 rounded-lg p-4 mb-8 text-left">
                <h3 className="font-semibold mb-2">Summary</h3>
                <ul className="space-y-1 text-sm text-gray-400">
                  <li>✓ API Key configured</li>
                  <li>✓ Agent: {agentName}</li>
                  <li>✓ Timezone: {timezone}</li>
                  <li>✓ Web Chat enabled</li>
                  {discordToken && <li>✓ Discord connected</li>}
                  {telegramToken && <li>✓ Telegram connected</li>}
                </ul>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep('integrations')}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={loading}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {loading ? 'Deploying...' : 'Deploy Agent 🚀'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
