'use client';

/**
 * Settings Page
 * 
 * User settings including secrets management.
 */

import { useUser } from '@clerk/nextjs';
import { SecretsManager } from '@/components/SecretsManager';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface AgentInfo {
  agentEmail: string | null;
  browserbaseContextId: string | null;
  appName: string;
  region: string;
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);

  useEffect(() => {
    async function fetchAgentInfo() {
      try {
        const res = await fetch('/api/user/gateway');
        if (res.ok) {
          const data = await res.json();
          setAgentInfo({
            agentEmail: data.agentEmail,
            browserbaseContextId: data.browserbaseContextId,
            appName: data.appName,
            region: data.region,
          });
        }
      } catch (error) {
        console.error('Failed to fetch agent info:', error);
      } finally {
        setLoadingAgent(false);
      }
    }
    fetchAgentInfo();
  }, []);

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
        {/* Agent Info Section */}
        <section className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 mb-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900">Agent Info</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Your agent's contact details and integrations.
            </p>
          </div>
          
          {loadingAgent ? (
            <div className="flex items-center gap-2 text-zinc-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
              <span>Loading...</span>
            </div>
          ) : agentInfo ? (
            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Agent Email
                </label>
                {agentInfo.agentEmail ? (
                  <div className="flex items-center gap-2">
                    <code className="bg-zinc-100 px-3 py-2 rounded-lg text-sm font-mono text-zinc-800">
                      {agentInfo.agentEmail}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(agentInfo.agentEmail!)}
                      className="text-zinc-500 hover:text-zinc-700 p-1"
                      title="Copy to clipboard"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Not configured</p>
                )}
                <p className="text-xs text-zinc-500 mt-1">
                  Your agent can send and receive emails at this address.
                </p>
              </div>

              {/* Browser */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Web Browsing
                </label>
                {agentInfo.browserbaseContextId ? (
                  <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-1 rounded text-sm">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Enabled (Browserbase)
                  </span>
                ) : (
                  <span className="text-sm text-zinc-500">Not configured</span>
                )}
                <p className="text-xs text-zinc-500 mt-1">
                  Your agent can browse the web with persistent cookies.
                </p>
              </div>

              {/* Region */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Server Region
                </label>
                <span className="text-sm text-zinc-600">{agentInfo.region?.toUpperCase() || 'Unknown'}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Unable to load agent info.</p>
          )}
        </section>

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
