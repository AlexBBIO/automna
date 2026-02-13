'use client';

import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

export default function ClaudeSetupPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  const handleSubmit = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/user/byok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: token.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to validate credential');
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
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Connect your Claude subscription</h1>
        <p className="text-zinc-400 mb-8">
          Follow these steps to generate a setup token from Claude Code.
        </p>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-purple-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold">1</span>
              <h3 className="font-semibold">Install Claude Code</h3>
            </div>
            <div className="bg-black/50 rounded-lg p-3 font-mono text-sm flex items-center justify-between">
              <code>npm install -g @anthropic-ai/claude-code</code>
              <CopyButton text="npm install -g @anthropic-ai/claude-code" />
            </div>
            <p className="text-xs text-zinc-500 mt-2">Requires Node.js 18+</p>
          </div>

          {/* Step 2 */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-purple-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold">2</span>
              <h3 className="font-semibold">Generate a setup token</h3>
            </div>
            <div className="bg-black/50 rounded-lg p-3 font-mono text-sm flex items-center justify-between">
              <code>claude setup-token</code>
              <CopyButton text="claude setup-token" />
            </div>
            <p className="text-xs text-zinc-500 mt-2">This will open your browser to authenticate, then print a token starting with <code className="text-purple-400">sk-ant-oat</code></p>
          </div>

          {/* Step 3 */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-purple-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold">3</span>
              <h3 className="font-semibold">Paste your token</h3>
            </div>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk-ant-oat01-..."
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
          disabled={loading || !token.trim()}
          className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition"
        >
          {loading ? 'Validating...' : 'Validate & Continue'}
        </button>

        <p className="text-center text-zinc-500 text-xs mt-4">
          Your token is encrypted and stored securely. We never see your Claude conversations.
        </p>
      </main>
    </div>
  );
}
