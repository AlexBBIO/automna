'use client';

import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function ApiKeySetupPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/user/byok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: apiKey.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to validate API key');
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
        </Link>
        <Link href="/setup/connect" className="text-sm text-zinc-400 hover:text-white transition">
          ← Back
        </Link>
      </nav>

      <main className="max-w-xl mx-auto px-6 py-8">
        {/* Cost Warning */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-amber-400 text-lg">⚠️</span>
            <div>
              <h3 className="font-semibold text-amber-200 mb-1">API usage costs extra</h3>
              <p className="text-amber-300/80 text-sm">
                Active AI agents typically use $100-500+/mo in API credits. 
                Consider using a{' '}
                <Link href="/setup/connect/claude" className="underline hover:text-amber-200">
                  Claude subscription
                </Link>
                {' '}instead for predictable costs.
              </p>
            </div>
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold mb-2">Connect with API key</h1>
        <p className="text-zinc-400 mb-8">
          Enter your Anthropic API key to power your agent.
        </p>

        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="font-semibold mb-2">Get your API key</h3>
            <p className="text-zinc-400 text-sm mb-3">
              Create or copy your key from the Anthropic console:
            </p>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm font-medium transition"
            >
              console.anthropic.com/settings/keys
              <span>↗</span>
            </a>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 font-mono text-sm placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 transition"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !apiKey.trim()}
          className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition"
        >
          {loading ? 'Validating...' : 'Validate & Continue'}
        </button>

        <p className="text-center mt-4">
          <Link href="/setup/connect/claude" className="text-purple-400 hover:text-purple-300 text-sm">
            Switch to Claude subscription instead →
          </Link>
        </p>
      </main>
    </div>
  );
}
