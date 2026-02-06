'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface UsageData {
  plan: string;
  usage: {
    totalTokens: number;
    costCents: number;
  };
  limits: {
    monthlyTokens: number;
    monthlyCostCents: number;
  };
  percentUsed: {
    tokens: number;
    cost: number;
  };
}

type WarningLevel = 'none' | 'info' | 'warning' | 'limit';

interface DismissedState {
  level: WarningLevel;
  timestamp: number;
}

// How long a dismissed warning stays hidden (4 hours)
const DISMISS_DURATION_MS = 4 * 60 * 60 * 1000;

function getWarningLevel(percentUsed: number): WarningLevel {
  if (percentUsed >= 100) return 'limit';
  if (percentUsed >= 80) return 'warning';
  if (percentUsed >= 50) return 'info';
  return 'none';
}

function getDismissedState(): DismissedState | null {
  try {
    const raw = localStorage.getItem('usage-banner-dismissed');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setDismissedState(level: WarningLevel) {
  try {
    localStorage.setItem('usage-banner-dismissed', JSON.stringify({
      level,
      timestamp: Date.now(),
    }));
  } catch {
    // Ignore storage errors
  }
}

export function UsageBanner({ gatewayUrl, authToken }: { gatewayUrl: string; authToken?: string }) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const fetchUsage = useCallback(async () => {
    try {
      // Try fetching from the user-facing usage API
      const res = await fetch('/api/llm/usage', {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      setUsage(data);
    } catch {
      // Silent fail - usage banner is non-critical
    }
  }, [authToken]);

  // Fetch usage on mount and every 5 minutes
  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  // Check if previously dismissed
  useEffect(() => {
    if (!usage) return;
    const maxPercent = Math.max(usage.percentUsed.tokens, usage.percentUsed.cost);
    const currentLevel = getWarningLevel(maxPercent);
    const dismissedState = getDismissedState();
    
    if (dismissedState) {
      const isExpired = Date.now() - dismissedState.timestamp > DISMISS_DURATION_MS;
      const isHigherLevel = currentLevel === 'limit' && dismissedState.level !== 'limit';
      
      // Re-show if expired, or if we've escalated to hard limit
      if (!isExpired && !isHigherLevel) {
        setDismissed(true);
      }
    }
  }, [usage]);

  if (!usage) return null;
  
  const maxPercent = Math.max(usage.percentUsed.tokens, usage.percentUsed.cost);
  const level = getWarningLevel(maxPercent);
  
  if (level === 'none' || dismissed) return null;

  const handleDismiss = () => {
    if (level === 'limit') return; // Can't dismiss hard limit
    setFadeOut(true);
    setTimeout(() => {
      setDismissed(true);
      setDismissedState(level);
    }, 300);
  };

  const planName = usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1);
  const usedTokensK = Math.round(usage.usage.totalTokens / 1000);
  const limitTokensK = Math.round(usage.limits.monthlyTokens / 1000);

  // Style based on level
  const styles = {
    info: {
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      border: 'border-blue-200 dark:border-blue-500/20',
      text: 'text-blue-800 dark:text-blue-200',
      subtext: 'text-blue-600 dark:text-blue-300',
      bar: 'bg-blue-500',
      barBg: 'bg-blue-200 dark:bg-blue-500/20',
      icon: 'ℹ️',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'border-amber-200 dark:border-amber-500/20',
      text: 'text-amber-800 dark:text-amber-200',
      subtext: 'text-amber-600 dark:text-amber-300',
      bar: 'bg-amber-500',
      barBg: 'bg-amber-200 dark:bg-amber-500/20',
      icon: '⚠️',
    },
    limit: {
      bg: 'bg-red-50 dark:bg-red-500/10',
      border: 'border-red-200 dark:border-red-500/20',
      text: 'text-red-800 dark:text-red-200',
      subtext: 'text-red-600 dark:text-red-300',
      bar: 'bg-red-500',
      barBg: 'bg-red-200 dark:bg-red-500/20',
      icon: '🚫',
    },
  };

  const s = styles[level];

  const messages = {
    info: `You've used ${usedTokensK}K of ${limitTokensK}K tokens on your ${planName} plan this month.`,
    warning: `You've used ${usedTokensK}K of ${limitTokensK}K tokens on your ${planName} plan. Upgrade to keep chatting uninterrupted.`,
    limit: `You've reached your ${planName} plan token limit (${limitTokensK}K). Upgrade to continue using your agent.`,
  };

  return (
    <div 
      className={`
        ${s.bg} ${s.border} border-b px-4 py-2.5
        transition-all duration-300 ease-in-out
        ${fadeOut ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'}
      `}
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        <span className="text-base flex-shrink-0">{s.icon}</span>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <p className={`text-sm font-medium ${s.text} truncate`}>
              {messages[level]}
            </p>
          </div>
          
          {/* Progress bar */}
          <div className={`${s.barBg} rounded-full h-1.5 mt-1.5 overflow-hidden`}>
            <div 
              className={`${s.bar} h-full rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(maxPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Upgrade link */}
        <Link
          href="/pricing"
          className={`
            flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium
            transition-colors
            ${level === 'limit' 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : level === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
          `}
        >
          Upgrade
        </Link>

        {/* Dismiss button (not for hard limit) */}
        {level !== 'limit' && (
          <button
            onClick={handleDismiss}
            className={`flex-shrink-0 p-1 rounded-lg ${s.subtext} hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
