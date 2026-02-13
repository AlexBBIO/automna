'use client';

/**
 * Settings Panel - Embeddable settings component for dashboard
 */

import { useEffect, useState, useCallback } from 'react';

interface AgentInfo {
  agentEmail: string | null;
  browserbaseContextId: string | null;
  phoneNumber: string | null;
  appName: string;
  region: string;
}

interface UsageInfo {
  plan: string;
  used: number;
  limit: number;
  periodStart: string;
  periodEnd: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function UsageSection() {
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsage = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/user/usage');
      if (res.ok) {
        setUsage(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  if (loading) {
    return (
      <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
          <span>Loading usage...</span>
        </div>
      </section>
    );
  }

  if (!usage) return null;

  const pct = usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0;
  const barColor = pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-green-500';
  const periodEnd = new Date(usage.periodEnd);
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Usage</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {daysLeft} day{daysLeft !== 1 ? 's' : ''} left in billing period
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
            {usage.plan}
          </span>
          <button
            onClick={() => fetchUsage(true)}
            disabled={refreshing}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors disabled:opacity-50"
            title="Refresh usage"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-900 dark:text-white">{formatNumber(usage.used)}</span>
          {' / '}
          {formatNumber(usage.limit)} credits
        </span>
        <span className={`font-medium ${pct >= 80 ? 'text-red-500' : pct >= 50 ? 'text-yellow-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {pct.toFixed(1)}%
        </span>
      </div>
    </section>
  );
}

interface BYOKStatus {
  enabled: boolean;
  type: string | null;
  lastValidated: string | null;
}

function AIConnectionSection() {
  const [status, setStatus] = useState<BYOKStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch('/api/user/byok')
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatus(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your AI credentials? Your agent will stop working until you reconnect.')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/user/byok', { method: 'DELETE' });
      setStatus({ enabled: false, type: null, lastValidated: null });
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
          <span>Loading AI connection...</span>
        </div>
      </section>
    );
  }

  const connectionLabel = status?.type === 'anthropic_oauth' ? 'Claude Subscription' : status?.type === 'anthropic_api_key' ? 'API Key' : null;

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">AI Connection</h2>
      
      {status?.enabled ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded text-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Connected
            </span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">via {connectionLabel}</span>
          </div>
          {status.lastValidated && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Last validated: {new Date(status.lastValidated).toLocaleDateString()}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <a
              href="/setup/connect"
              className="px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition text-zinc-700 dark:text-zinc-300"
            >
              Change
            </a>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded text-sm">
              ⚠️ Not connected
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Connect your Claude account to start using your agent.
          </p>
          <a
            href="/setup/connect"
            className="inline-block px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition font-medium"
          >
            Connect AI
          </a>
        </div>
      )}
    </section>
  );
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
        {/* AI Connection */}
        <AIConnectionSection />

        {/* Usage Section */}
        <UsageSection />

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
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Provisioning — check back in a minute</span>
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
