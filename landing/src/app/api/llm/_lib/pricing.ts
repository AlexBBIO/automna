/**
 * LLM Pricing Calculator
 * 
 * Calculates costs for Anthropic and Gemini API calls.
 * Prices in microdollars (1 USD = 1,000,000 microdollars) for precision.
 */

/**
 * Anthropic pricing as of Jan 2026 (per million tokens in microdollars)
 */
export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  // Opus 4.5 - $15 input, $75 output per million
  'claude-opus-4-5': { input: 15_000_000, output: 75_000_000 },
  'claude-opus-4-5-20250929': { input: 15_000_000, output: 75_000_000 },
  'anthropic/claude-opus-4-5': { input: 15_000_000, output: 75_000_000 },
  
  // Sonnet 4 - $3 input, $15 output per million
  'claude-sonnet-4': { input: 3_000_000, output: 15_000_000 },
  'claude-sonnet-4-20250514': { input: 3_000_000, output: 15_000_000 },
  'anthropic/claude-sonnet-4': { input: 3_000_000, output: 15_000_000 },
  
  // Haiku - $0.25 input, $1.25 output per million
  'claude-3-5-haiku': { input: 250_000, output: 1_250_000 },
  'claude-3-5-haiku-latest': { input: 250_000, output: 1_250_000 },
  'claude-3-5-haiku-20241022': { input: 250_000, output: 1_250_000 },
  
  // Default fallback (Sonnet pricing)
  'default': { input: 3_000_000, output: 15_000_000 },
};

/**
 * Gemini pricing (embeddings) - per million tokens in microdollars
 */
export const GEMINI_PRICING: Record<string, { input: number }> = {
  'gemini-embedding-001': { input: 10_000 }, // ~$0.00001 per token
  'text-embedding-004': { input: 10_000 },
  'default': { input: 10_000 },
};

/**
 * Calculate cost in microdollars
 */
export function calculateCost(
  provider: 'anthropic' | 'gemini',
  model: string,
  inputTokens: number,
  outputTokens: number = 0
): number {
  if (provider === 'anthropic') {
    const pricing = ANTHROPIC_PRICING[model] || ANTHROPIC_PRICING['default'];
    const inputCost = Math.ceil((inputTokens / 1_000_000) * pricing.input);
    const outputCost = Math.ceil((outputTokens / 1_000_000) * pricing.output);
    return inputCost + outputCost;
  }
  
  if (provider === 'gemini') {
    const pricing = GEMINI_PRICING[model] || GEMINI_PRICING['default'];
    return Math.ceil((inputTokens / 1_000_000) * pricing.input);
  }
  
  return 0;
}

/**
 * Format microdollars as human-readable USD
 */
export function formatCost(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(6)}`;
  }
  return `$${dollars.toFixed(4)}`;
}

/**
 * Convert microdollars to cents
 */
export function microToCents(microdollars: number): number {
  return Math.floor(microdollars / 10_000);
}
