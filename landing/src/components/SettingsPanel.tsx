'use client';

/**
 * Settings Panel - Embeddable settings component for dashboard
 */

import { useEffect, useState } from 'react';

interface AgentInfo {
  agentEmail: string | null;
  browserbaseContextId: string | null;
  phoneNumber: string | null;
  appName: string;
  region: string;
}

export function SettingsPanel() {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    async function fetchAgentInfo() {
      try {
        const res = await fetch('/api/user/gateway');
        if (res.ok) {
          const data = await res.json();
          setAgentInfo({
            agentEmail: data.agentEmail,
            browserbaseContextId: data.browserbaseContextId,
            phoneNumber: data.phoneNumber,
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

  const handleCopyEmail = async () => {
    if (agentInfo?.agentEmail) {
      await navigator.clipboard.writeText(agentInfo.agentEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Agent Info Section */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Agent Info</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Your agent's contact details and integrations.
            </p>
          </div>
          
          {loadingAgent ? (
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
              <span>Loading...</span>
            </div>
          ) : agentInfo ? (
            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Agent Email
                </label>
                {agentInfo.agentEmail ? (
                  <div className="flex items-center gap-2">
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg text-sm font-mono text-zinc-800 dark:text-zinc-200">
                      {agentInfo.agentEmail}
                    </code>
                    <button
                      onClick={handleCopyEmail}
                      className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 p-1"
                      title="Copy to clipboard"
                    >
                      {copiedEmail ? (
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Not configured</p>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Your agent can send and receive emails at this address.
                </p>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Phone Number
                </label>
                {agentInfo.phoneNumber ? (
                  <div className="flex items-center gap-2">
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg text-sm font-mono text-zinc-800 dark:text-zinc-200">
                      {agentInfo.phoneNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}
                    </code>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(agentInfo.phoneNumber!);
                        setCopiedPhone(true);
                        setTimeout(() => setCopiedPhone(false), 2000);
                      }}
                      className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 p-1"
                      title="Copy to clipboard"
                    >
                      {copiedPhone ? (
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Available on Pro plan</span>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Your agent can make and receive phone calls at this number.
                </p>
              </div>

              {/* Browser */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Web Browsing
                </label>
                {agentInfo.browserbaseContextId ? (
                  <span className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded text-sm">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Enabled (Browserbase)
                  </span>
                ) : (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Not configured</span>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Your agent can browse the web with persistent cookies.
                </p>
              </div>

              {/* Region */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Server Region
                </label>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{agentInfo.region?.toUpperCase() || 'Unknown'}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Unable to load agent info.</p>
          )}
        </section>

        {/* Secrets Section - Coming Soon */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6 opacity-50">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Secrets</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Coming soon: Securely store API keys, tokens, and other sensitive values for your agent.
          </p>
        </section>

        {/* Coming Soon sections */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6 opacity-50">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Agent Configuration</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Coming soon: Customize your agent's model, personality, and more.
          </p>
        </section>

        <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 opacity-50">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Integrations</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Coming soon: Connect Discord, Telegram, and more with guided setup.
          </p>
        </section>
      </div>
    </div>
  );
}
