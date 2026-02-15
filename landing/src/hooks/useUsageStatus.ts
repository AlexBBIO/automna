'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export interface UsageData {
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
  isByok?: boolean;
}

// Poll every 5 minutes normally, every 30 seconds when at limit
const NORMAL_POLL_MS = 5 * 60 * 1000;
const LIMIT_POLL_MS = 30 * 1000;

export function useUsageStatus(authToken?: string) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isOverLimit, setIsOverLimit] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/llm/usage', {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
      });
      if (!res.ok) return;
      const data: UsageData = await res.json();
      setUsage(data);
      
      // BYOK users bypass credit limits — never lock chat input
      const maxPercent = Math.max(data.percentUsed.tokens, data.percentUsed.cost);
      setIsOverLimit(data.isByok ? false : maxPercent >= 100);
    } catch {
      // Silent fail
    }
  }, [authToken]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Adjust polling interval based on limit status
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    const pollMs = isOverLimit ? LIMIT_POLL_MS : NORMAL_POLL_MS;
    intervalRef.current = setInterval(fetchUsage, pollMs);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isOverLimit, fetchUsage]);

  return { usage, isOverLimit };
}
