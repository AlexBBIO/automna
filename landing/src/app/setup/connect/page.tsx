'use client';

import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ConnectPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

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
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition">
          Dashboard →
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Connect your AI</h1>
          <p className="text-zinc-400">
            Automna uses your own Claude account. Choose how to connect:
          </p>
        </div>

        <div className="space-y-4">
          {/* Claude Subscription Option */}
          <Link
            href="/setup/connect/claude"
            className="block bg-gradient-to-r from-purple-500/10 to-purple-900/10 border-2 border-purple-500/50 hover:border-purple-400 rounded-2xl p-6 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-bold">Use your Claude subscription</h2>
                  <span className="px-2 py-0.5 bg-purple-600 rounded-full text-xs font-medium">
                    RECOMMENDED
                  </span>
                </div>
                <p className="text-zinc-400 text-sm mb-3">
                  Connect your existing Claude Pro/Max subscription. No extra AI costs — 
                  you already pay Anthropic directly.
                </p>
                <div className="flex items-center gap-2 text-purple-400 text-sm font-medium">
                  <span>⭐ Best value — no additional AI charges</span>
                </div>
              </div>
              <span className="text-zinc-500 group-hover:text-purple-400 transition mt-2">→</span>
            </div>
          </Link>

          {/* API Key Option */}
          <Link
            href="/setup/connect/apikey"
            className="block bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2">Use an API key</h2>
                <p className="text-zinc-400 text-sm mb-3">
                  Use an Anthropic API key for pay-per-use access. Best for developers 
                  or specific use cases.
                </p>
                <div className="flex items-center gap-2 text-amber-400 text-sm">
                  <span>⚠️ Usage-based billing — typically $100-500+/mo for active agents</span>
                </div>
              </div>
              <span className="text-zinc-500 group-hover:text-white transition mt-2">→</span>
            </div>
          </Link>

          {/* Bill me as I go Option */}
          <button
            onClick={async () => {
              try {
                // Mark user as proxy mode (no BYOK), then go to dashboard
                await fetch('/api/user/byok/proxy', { method: 'POST' });
                router.push('/dashboard');
              } catch {
                router.push('/dashboard');
              }
            }}
            className="block w-full text-left bg-white/5 border border-white/10 hover:border-emerald-500/50 rounded-2xl p-6 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2">Bill me as I go</h2>
                <p className="text-zinc-400 text-sm mb-3">
                  Skip connecting Claude. We&apos;ll handle the AI and bill you based on usage.
                  Your plan includes a monthly credit allowance for AI calls.
                </p>
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <span>💳 Easiest setup — just start chatting</span>
                </div>
              </div>
              <span className="text-zinc-500 group-hover:text-emerald-400 transition mt-2">→</span>
            </div>
          </button>
        </div>

        <p className="text-center text-zinc-500 text-sm mt-8">
          You can change your connection method anytime in Settings.
        </p>
      </main>
    </div>
  );
}
