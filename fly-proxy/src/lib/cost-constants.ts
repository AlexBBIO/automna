/**
 * Cost Constants for Automna Token System
 * 
 * All costs in microdollars (1 USD = 1,000,000 microdollars).
 * 1 Automna Token = 100 microdollars = $0.0001
 */

export const MICRODOLLARS_PER_AUTOMNA_TOKEN = 100;

export const COSTS = {
  BRAVE_SEARCH_PER_QUERY: 3_000,
  BROWSERBASE_PER_SESSION: 20_000,
  EMAIL_SEND: 2_000,
  CALL_PER_MINUTE: 90_000,
  CALL_FAILED_ATTEMPT: 15_000,
} as const;

// Named exports for convenience
export const BRAVE_SEARCH_COST_MICRODOLLARS = COSTS.BRAVE_SEARCH_PER_QUERY;
export const BROWSERBASE_SESSION_COST_MICRODOLLARS = COSTS.BROWSERBASE_PER_SESSION;
export const EMAIL_SEND_COST_MICRODOLLARS = COSTS.EMAIL_SEND;
