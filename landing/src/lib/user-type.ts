/**
 * User Billing Type — Single Source of Truth
 * 
 * Every file that needs to know "what kind of user is this?" imports from here.
 * Adding a new provider type (e.g., openai_api_key) only requires updating this file.
 */

export type UserBillingType = 'byok' | 'proxy' | 'legacy';

/**
 * Determine billing type from byokProvider field.
 */
export function getUserBillingType(byokProvider: string | null | undefined): UserBillingType {
  if (byokProvider === 'anthropic_oauth' || byokProvider === 'anthropic_api_key') return 'byok';
  if (byokProvider === 'proxy') return 'proxy';
  return 'legacy';
}

/**
 * Is this user bringing their own key?
 */
export function isByokUser(byokProvider: string | null | undefined): boolean {
  return getUserBillingType(byokProvider) === 'byok';
}

/**
 * Should we check/enforce credit limits for this user?
 * BYOK users bypass all credit checks — they pay Anthropic directly.
 */
export function shouldCheckCredits(byokProvider: string | null | undefined): boolean {
  return !isByokUser(byokProvider);
}

/**
 * Should the chat input be locked for this user?
 * BYOK users are never locked. Others are locked when over their limit.
 */
export function shouldLockChat(byokProvider: string | null | undefined, percentUsed: number): boolean {
  if (isByokUser(byokProvider)) return false;
  return percentUsed >= 100;
}
