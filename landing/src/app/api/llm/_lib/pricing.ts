/**
 * Pricing per million tokens (in dollars).
 * Updated as of February 2026.
 * 
 * Includes cache pricing:
 * - cache_creation: 1.25x input price (write to cache)
 * - cache_read: 0.1x input price (read from cache)
 * 
 * Note: Include both full model names (with dates) and short names
 * since OpenClaw/Clawdbot may send either format.
 */
interface ModelPricing {
  input: number;
  output: number;
  cacheCreation: number;  // 1.25x input
  cacheRead: number;      // 0.1x input
}

function makePricing(input: number, output: number): ModelPricing {
  return {
    input,
    output,
    cacheCreation: input * 1.25,
    cacheRead: input * 0.1,
  };
}

const PRICING: Record<string, ModelPricing> = {
  // Claude 4.5 models - short names (what OpenClaw sends)
  // Opus 4.5: $5/$25 (NOT $15/$75 — that's Opus 4)
  "claude-opus-4-5": makePricing(5.0, 25.0),
  "claude-sonnet-4-5": makePricing(3.0, 15.0),
  "claude-haiku-4-5": makePricing(1.0, 5.0),

  // Claude 4.5 models - full names with dates
  "claude-sonnet-4-5-20250514": makePricing(3.0, 15.0),
  "claude-opus-4-5-20250514": makePricing(5.0, 25.0),
  "claude-haiku-4-5-20250514": makePricing(1.0, 5.0),

  // Claude 4.6 models
  "claude-opus-4-6": makePricing(5.0, 25.0),
  "claude-opus-4-6-20260101": makePricing(5.0, 25.0),

  // Claude 4 models - short names
  "claude-opus-4": makePricing(15.0, 75.0),
  "claude-sonnet-4": makePricing(3.0, 15.0),

  // Claude 4 models - full names with dates
  "claude-sonnet-4-20250514": makePricing(3.0, 15.0),
  "claude-opus-4-20250514": makePricing(15.0, 75.0),

  // Legacy models
  "claude-3-5-sonnet-20241022": makePricing(3.0, 15.0),
  "claude-3-5-haiku-20241022": makePricing(1.0, 5.0),
  "claude-3-opus-20240229": makePricing(15.0, 75.0),
  "claude-3-sonnet-20240229": makePricing(3.0, 15.0),
  "claude-3-haiku-20240307": makePricing(0.25, 1.25),

  // Default fallback (Sonnet pricing)
  default: makePricing(3.0, 15.0),
};

/**
 * Calculate cost in microdollars (1 USD = 1,000,000 microdollars).
 * Using microdollars avoids floating-point precision issues.
 * 
 * Now accounts for all token types including cache tokens.
 */
export function calculateCostMicrodollars(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number = 0,
  cacheReadTokens: number = 0,
): number {
  const pricing = PRICING[model] ?? PRICING.default;

  // Convert to microdollars: (tokens / 1M) * price * 1M = tokens * price
  const inputCost = inputTokens * pricing.input;
  const outputCost = outputTokens * pricing.output;
  const cacheCreationCost = cacheCreationTokens * pricing.cacheCreation;
  const cacheReadCost = cacheReadTokens * pricing.cacheRead;

  return Math.round(inputCost + outputCost + cacheCreationCost + cacheReadCost);
}

/**
 * Calculate cost in cents (for display and rate limiting).
 */
export function calculateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number = 0,
  cacheReadTokens: number = 0,
): number {
  const microdollars = calculateCostMicrodollars(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
  // 1 cent = 10,000 microdollars
  return Math.ceil(microdollars / 10000);
}

/**
 * Convert microdollars to cents.
 */
export function microToCents(microdollars: number): number {
  return Math.ceil(microdollars / 10000);
}

/**
 * Format microdollars as a dollar string (e.g., "$1.23").
 */
export function formatCost(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  return `$${dollars.toFixed(2)}`;
}
