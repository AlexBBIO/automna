'use client';

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const [loadingPortal, setLoadingPortal] = useState(false);

  const plan = (user?.publicMetadata?.plan as string) || 'free';
  const subscriptionStatus = user?.publicMetadata?.subscriptionStatus as string;

  const handleManageBilling = async () => {
    setLoadingPortal(true);
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Billing portal error:', error);
    }
    setLoadingPortal(false);
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800 bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">
              {user?.emailAddresses[0]?.emailAddress}
            </span>
            <button
              onClick={handleManageBilling}
              disabled={loadingPortal}
              className="text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50"
            >
              {loadingPortal ? '...' : 'Billing'}
            </button>
            <UserButton 
              appearance={{
                elements: {
                  avatarBox: "w-10 h-10",
                },
              }}
            />
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">
            Welcome, {user?.firstName || 'there'}! 👋
          </h1>

          {/* Coming Soon Card */}
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-8 text-center">
            <div className="text-6xl mb-4">🚀</div>
            <h2 className="text-2xl font-semibold mb-4">Your Agent is Coming Soon</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              We&apos;re putting the finishing touches on your AI agent experience. 
              You&apos;ll be among the first to deploy when we launch.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <div className="bg-gray-800/50 rounded-lg px-6 py-4">
                <div className="text-gray-400 text-sm">Your spot</div>
                <div className="text-2xl font-bold text-purple-400">#1</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg px-6 py-4">
                <div className="text-gray-400 text-sm">Status</div>
                <div className="text-2xl font-bold text-green-400">
                  {plan !== 'free' ? 'Priority' : 'Waitlist'}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-purple-500/30 transition-colors cursor-pointer">
              <div className="text-2xl mb-3">📖</div>
              <h3 className="font-semibold mb-2">Documentation</h3>
              <p className="text-gray-400 text-sm">Learn what your agent can do</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-purple-500/30 transition-colors cursor-pointer">
              <div className="text-2xl mb-3">💬</div>
              <h3 className="font-semibold mb-2">Community</h3>
              <p className="text-gray-400 text-sm">Join our Discord server</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-purple-500/30 transition-colors cursor-pointer">
              <div className="text-2xl mb-3">📧</div>
              <h3 className="font-semibold mb-2">Support</h3>
              <p className="text-gray-400 text-sm">Get help when you need it</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
