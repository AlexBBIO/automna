'use client';

import { useState, useEffect, useCallback } from 'react';

interface CreditPack {
  id: string;
  credits: number;
  priceCents: number;
  label: string;
  priceLabel: string;
}

interface CreditTransaction {
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string | null;
}

interface CreditData {
  balance: number;
  autoRefill: {
    enabled: boolean;
    amountCents: number;
    threshold: number;
  };
  costCap: {
    monthlyCents: number;
    spentCents: number;
  };
  packs: CreditPack[];
  transactions: CreditTransaction[];
}

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function CreditsPanel() {
  const [data, setData] = useState<CreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Settings form
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(false);
  const [autoRefillAmount, setAutoRefillAmount] = useState(10);
  const [autoRefillThreshold, setAutoRefillThreshold] = useState(10000);
  const [monthlyCostCap, setMonthlyCostCap] = useState(0);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch('/api/user/credits');
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setAutoRefillEnabled(d.autoRefill.enabled);
        setAutoRefillAmount(d.autoRefill.amountCents / 100);
        setAutoRefillThreshold(d.autoRefill.threshold);
        setMonthlyCostCap(d.costCap.monthlyCents / 100);
      }
    } catch (e) {
      console.error('Failed to fetch credits:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  const handlePurchase = async (packId: string) => {
    setPurchasing(packId);
    try {
      const res = await fetch('/api/user/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
    } catch (e) {
      console.error('Purchase error:', e);
      alert('Failed to start purchase. Please try again.');
    }
    setPurchasing(null);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await fetch('/api/user/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoRefillEnabled,
          autoRefillAmountCents: Math.round(autoRefillAmount * 100),
          autoRefillThreshold,
          monthlyCostCapCents: Math.round(monthlyCostCap * 100),
        }),
      });
      await fetchCredits();
    } catch (e) {
      console.error('Save error:', e);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-zinc-500 dark:text-zinc-400">
        Failed to load credit information.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 overflow-y-auto h-full">
      {/* Balance */}
      <div className="bg-gradient-to-r from-purple-500/10 to-violet-500/10 border border-purple-500/20 rounded-2xl p-6 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">Credit Balance</p>
        <p className="text-4xl font-bold text-zinc-900 dark:text-white">{formatCredits(data.balance)}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">credits remaining</p>
      </div>

      {/* Buy Credits */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Buy Credits</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.packs.map((pack) => (
            <button
              key={pack.id}
              onClick={() => handlePurchase(pack.id)}
              disabled={purchasing === pack.id}
              className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-purple-500 dark:hover:border-purple-400 rounded-xl p-4 text-center transition-all disabled:opacity-50"
            >
              <p className="text-lg font-bold text-zinc-900 dark:text-white">{pack.priceLabel}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{pack.label}</p>
              {purchasing === pack.id && <p className="text-xs text-purple-500 mt-1">Redirecting...</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-Refill Settings */}
      <div className="bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">Auto-Refill</h3>
        
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefillEnabled}
            onChange={(e) => setAutoRefillEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            Automatically buy more credits when balance is low
          </span>
        </label>

        {autoRefillEnabled && (
          <div className="space-y-3 pl-7">
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">Refill when below</label>
              <select
                value={autoRefillThreshold}
                onChange={(e) => setAutoRefillThreshold(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white"
              >
                <option value={5000}>5K credits</option>
                <option value={10000}>10K credits</option>
                <option value={25000}>25K credits</option>
                <option value={50000}>50K credits</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">Refill amount</label>
              <select
                value={autoRefillAmount}
                onChange={(e) => setAutoRefillAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white"
              >
                <option value={5}>$5 (50K credits)</option>
                <option value={10}>$10 (100K credits)</option>
                <option value={25}>$25 (300K credits)</option>
                <option value={50}>$50 (750K credits)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">Monthly spending cap ($0 = no limit)</label>
              <input
                type="number"
                min={0}
                step={5}
                value={monthlyCostCap}
                onChange={(e) => setMonthlyCostCap(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white"
                placeholder="0"
              />
              {data.costCap.spentCents > 0 && (
                <p className="text-xs text-zinc-400 mt-1">
                  Spent this month: ${(data.costCap.spentCents / 100).toFixed(2)}
                  {monthlyCostCap > 0 && ` / $${monthlyCostCap}`}
                </p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Transaction History */}
      {data.transactions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Recent Activity</h3>
          <div className="space-y-1">
            {data.transactions.map((tx, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {tx.type === 'purchase' ? '💳' : tx.type === 'refill' ? '🔄' : tx.type === 'usage' ? '⚡' : '🎁'}
                  </span>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {tx.description || tx.type}
                  </span>
                </div>
                <span className={`text-sm font-medium ${tx.amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  {tx.amount > 0 ? '+' : ''}{formatCredits(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
