/**
 * Cost Constants for Automna Token System
 * 
 * All costs in microdollars (1 USD = 1,000,000 microdollars).
 * 1 Automna Token = 100 microdollars = $0.0001
 * 
 * ⚠️ UPDATE THIS FILE when adding new billable services or when
 * provider pricing changes. See docs/AUTOMNA-TOKENS.md for details.
 */

// Exchange rate
export const MICRODOLLARS_PER_AUTOMNA_TOKEN = 100;

// Fixed-rate service costs (microdollars)
export const COSTS = {
  // Brave Search: $0.003/query
  BRAVE_SEARCH_PER_QUERY: 3_000,

  // Browserbase: ~$0.02/session (flat estimate, ~10 min avg)
  BROWSERBASE_PER_SESSION: 20_000,

  // Email: ~$0.002/send
  EMAIL_SEND: 2_000,

  // Voice calls (Bland.ai): $0.09/min connected
  CALL_PER_MINUTE: 90_000,

  // Voice calls: $0.015 per failed/no-answer attempt
  CALL_FAILED_ATTEMPT: 15_000,
} as const;
