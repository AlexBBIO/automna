'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface BYOKStatus {
  enabled: boolean;
  type: string | null;
}

interface ServiceUsage {
  plan: string;
  searches: { used: number; limit: number };
  browserMinutes: { used: number; limit: number };
  emails: { used: number; limit: number };
  callMinutes: { used: number; limit: number };
}

// Simplified banner for BYOK mode
export function UsageBanner({ usage }: { usage: unknown }) {
  const [byokStatus, setBYOKStatus] = useState<BYOKStatus | null>(null);
  const [serviceUsage, setServiceUsage] = useState<ServiceUsage | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Fetch BYOK status
    fetch('/api/user/byok')
      .then(r => r.ok ? r.json() : null)
      .then(data => setBYOKStatus(data))
      .catch(() => {});

    // Fetch service usage
    fetch('/api/user/usage')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setServiceUsage(data);
      })
      .catch(() => {});
  }, []);

  if (dismissed) return null;

  // Show BYOK not connected warning - ONLY for users who have a BYOK plan (type is set but not enabled)
  // Don't show this to legacy users who are on the old $79/mo plan
  if (byokStatus && !byokStatus.enabled && byokStatus.type) {
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

  // Show service usage summary
  if (byokStatus?.enabled && serviceUsage) {
    const planName = serviceUsage.plan.charAt(0).toUpperCase() + serviceUsage.plan.slice(1);
    const connectionType = byokStatus.type === 'anthropic_oauth' ? 'Claude' : 'API Key';

    // Check if any service is near limit (>80%)
    const items = [
      serviceUsage.searches,
      serviceUsage.browserMinutes,
      serviceUsage.emails,
      serviceUsage.callMinutes,
    ].filter(s => s && s.limit > 0);
    
    const nearLimit = items.some(s => s.used / s.limit >= 0.8);
    if (!nearLimit) return null; // Only show when nearing limits

    return (
      <div className="bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20 px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <span className="text-base flex-shrink-0">ℹ️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <span className="font-medium">{planName} Plan</span>
              <span className="mx-1.5">•</span>
              <span className="text-green-600 dark:text-green-400">{connectionType} Connected ✅</span>
              <span className="mx-1.5 text-blue-400">|</span>
              <span className="text-xs">
                Search: {serviceUsage.searches.used}/{serviceUsage.searches.limit.toLocaleString()}
                {serviceUsage.browserMinutes.limit > 0 && ` | Browser: ${serviceUsage.browserMinutes.used}/${serviceUsage.browserMinutes.limit} min`}
                {serviceUsage.emails.limit > 0 && ` | Email: ${serviceUsage.emails.used}/${serviceUsage.emails.limit}`}
                {serviceUsage.callMinutes.limit > 0 && ` | Phone: ${serviceUsage.callMinutes.used}/${serviceUsage.callMinutes.limit} min`}
              </span>
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="flex-shrink-0 p-1 rounded-lg text-blue-600 dark:text-blue-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
