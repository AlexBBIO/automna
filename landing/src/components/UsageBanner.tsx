'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isByokUser } from '@/lib/user-type';

interface BYOKStatus {
  enabled: boolean;
  type: string | null;
  isProxy?: boolean;
}

interface CreditUsage {
  plan: string;
  used: number;
  limit: number;
  creditBalance?: number;
  periodStart: string;
  periodEnd: string;
  isByok?: boolean;
  isProxy?: boolean;
}

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// Usage banner for all user types
export function UsageBanner({ usage }: { usage: unknown }) {
  const [byokStatus, setBYOKStatus] = useState<BYOKStatus | null>(null);
  const [creditUsage, setCreditUsage] = useState<CreditUsage | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/user/byok')
      .then(r => r.ok ? r.json() : null)
      .then(data => setBYOKStatus(data))
      .catch(() => {});

    fetch('/api/user/usage')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setCreditUsage(data); })
      .catch(() => {});
  }, []);

  if (dismissed) return null;

  // Show connect warning for users who haven't chosen a connection method
  if (byokStatus && !byokStatus.enabled && !byokStatus.isProxy && byokStatus.type) {
    return (
      <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <span className="text-base flex-shrink-0">⚠️</span>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 flex-1">
            Connect your Claude account to start using your agent.
          </p>
          <Link
            href="/setup/connect"
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors"
          >
            Connect AI
          </Link>
        </div>
      </div>
    );
  }

  // Prepaid credit balance for proxy (bill-as-you-go) users
  if (creditUsage?.isProxy) {
    const balance = creditUsage.creditBalance ?? 0;
    const isEmpty = balance <= 0;
    const isLow = balance > 0 && balance < 10000;
    const bgColor = isEmpty
      ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
      : isLow
      ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
      : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/50';

    return (
      <div className={`${bgColor} border-b px-4 py-3`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
              {formatCredits(balance)} credits remaining
            </span>
            {isEmpty && <span className="text-xs text-red-600 dark:text-red-400 font-medium">Buy credits to continue</span>}
            {isLow && !isEmpty && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Running low</span>}
          </div>
          <Link
            href="/dashboard?tab=credits"
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              isEmpty
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {isEmpty ? 'Buy Credits' : 'Manage Credits'}
          </Link>
        </div>
      </div>
    );
  }

  // Credit usage banner for legacy (non-BYOK, non-proxy) users with monthly allowance
  if (creditUsage && creditUsage.limit > 0 && !creditUsage.isByok && !creditUsage.isProxy) {
    const percent = Math.min(100, Math.round((creditUsage.used / creditUsage.limit) * 100));
    const daysLeft = Math.max(0, Math.ceil((new Date(creditUsage.periodEnd).getTime() - Date.now()) / 86400000));
    const planName = creditUsage.plan.charAt(0).toUpperCase() + creditUsage.plan.slice(1);
    const isOver = percent >= 100;
    const isNear = percent >= 80;

    const barColor = isOver ? 'bg-red-500' : isNear ? 'bg-amber-500' : 'bg-purple-500';
    const bgColor = isOver
      ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
      : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/50';

    return (
      <div className={`${bgColor} border-b px-4 py-3`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">Usage</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{daysLeft} days left</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600 text-white font-medium uppercase">{planName}</span>
              {isOver && (
                <Link href="/pricing" className="text-xs text-red-600 dark:text-red-400 font-medium hover:underline">
                  Upgrade →
                </Link>
              )}
            </div>
          </div>
          <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatCredits(creditUsage.used)} / {formatCredits(creditUsage.limit)} credits
            </span>
            <span className={`text-xs font-medium ${isOver ? 'text-red-600 dark:text-red-400' : isNear ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
              {percent}%
            </span>
          </div>
        </div>
      </div>
    );
  }

  // BYOK users: show connected status only when near service limits
  if (byokStatus?.enabled && creditUsage) {
    const planName = creditUsage.plan.charAt(0).toUpperCase() + creditUsage.plan.slice(1);
    const connectionType = byokStatus.type === 'anthropic_oauth' ? 'Claude' : 'API Key';

    // Minimal: just show plan + connection status, no usage bars
    return null; // BYOK users don't need a persistent banner
  }

  return null;
}
