/**
 * Pricing per million tokens (in dollars).
 * Updated as of February 2026.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  // Claude 4.5 models (2026)
  "claude-sonnet-4-5-20250514": { input: 3.0, output: 15.0 },
  "claude-opus-4-5-20250514": { input: 15.0, output: 75.0 },
  "claude-haiku-4-5-20250514": { input: 0.8, output: 4.0 },

  // Claude 4 models
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },

  // Legacy models
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 1.0, output: 5.0 },
  "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
  "claude-3-sonnet-20240229": { input: 3.0, output: 15.0 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },

  // Default fallback (Sonnet pricing)
  default: { input: 3.0, output: 15.0 },
};

/**
 * Calculate cost in microdollars (1 USD = 1,000,000 microdollars).
 * Using microdollars avoids floating-point precision issues.
 */
export function calculateCostMicrodollars(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model] ?? PRICING.default;

  // Convert to microdollars: (tokens / 1M) * price * 1M = tokens * price
  const inputCost = inputTokens * pricing.input;
  const outputCost = outputTokens * pricing.output;

  return Math.round(inputCost + outputCost);
}

/**
 * Calculate cost in cents (for display and rate limiting).
 */
export function calculateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const microdollars = calculateCostMicrodollars(model, inputTokens, outputTokens);
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
