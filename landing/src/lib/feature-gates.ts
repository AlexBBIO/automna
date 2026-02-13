/**
 * Feature gates for BYOK plan tiers.
 * Determines what features each plan has access to.
 */

import { PLAN_LIMITS } from '@/lib/db/schema';

export type BYOKPlanType = 'starter' | 'pro' | 'power';

export function canUsePhone(plan: string): boolean {
  return plan === 'pro' || plan === 'power';
}

export function canUseCron(plan: string): boolean {
  return plan === 'pro' || plan === 'power';
}

export function canUseApi(plan: string): boolean {
  return plan === 'power';
}

export function getMaxChannels(plan: string): number {
  const limits = PLAN_LIMITS[plan as BYOKPlanType];
  return limits?.maxChannels ?? 1;
}

export function shouldSleepWhenIdle(plan: string): boolean {
  const limits = PLAN_LIMITS[plan as BYOKPlanType];
  return limits?.sleepWhenIdle ?? true;
}

export function getSearchLimit(plan: string): number {
  const limits = PLAN_LIMITS[plan as BYOKPlanType];
  return limits?.monthlySearches ?? 500;
}

export function getBrowserMinuteLimit(plan: string): number {
  const limits = PLAN_LIMITS[plan as BYOKPlanType];
  return limits?.monthlyBrowserMinutes ?? 60;
}

export function getEmailLimit(plan: string): number {
  const limits = PLAN_LIMITS[plan as BYOKPlanType];
  return limits?.monthlyEmails ?? 100;
}

export function getCallMinuteLimit(plan: string): number {
  const limits = PLAN_LIMITS[plan as BYOKPlanType];
  return limits?.monthlyCallMinutes ?? 0;
}
