'use client';

/**
 * Settings Page
 * 
 * User settings including secrets management.
 */

import { useUser } from '@clerk/nextjs';
import { SecretsManager } from '@/components/SecretsManager';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <p>Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/dashboard" 
                className="text-zinc-500 hover:text-zinc-700"
              >
                ← Back to Dashboard
              </Link>
              <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
            </div>
            <div className="text-sm text-zinc-500">
              {user.primaryEmailAddress?.emailAddress}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Secrets Section */}
        <section className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900">Secrets</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Securely store API keys, tokens, and other sensitive values for your agent.
            </p>
          </div>
          
          <SecretsManager />
        </section>

        {/* Future sections */}
        <section className="mt-8 bg-white rounded-xl shadow-sm border border-zinc-200 p-6 opacity-50">
          <h2 className="text-lg font-semibold text-zinc-900">Agent Configuration</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Coming soon: Customize your agent's model, personality, and more.
          </p>
        </section>

        <section className="mt-8 bg-white rounded-xl shadow-sm border border-zinc-200 p-6 opacity-50">
          <h2 className="text-lg font-semibold text-zinc-900">Integrations</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Coming soon: Connect Discord, Telegram, and more with guided setup.
          </p>
        </section>
      </main>
    </div>
  );
}
