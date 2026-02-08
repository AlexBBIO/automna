interface ModelPricing {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

function makePricing(input: number, output: number): ModelPricing {
  return { input, output, cacheCreation: input * 1.25, cacheRead: input * 0.1 };
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-5": makePricing(5.0, 25.0),
  "claude-sonnet-4-5": makePricing(3.0, 15.0),
  "claude-haiku-4-5": makePricing(1.0, 5.0),
  "claude-sonnet-4-5-20250514": makePricing(3.0, 15.0),
  "claude-opus-4-5-20250514": makePricing(5.0, 25.0),
  "claude-haiku-4-5-20250514": makePricing(1.0, 5.0),
  "claude-opus-4-6": makePricing(5.0, 25.0),
  "claude-opus-4-6-20260101": makePricing(5.0, 25.0),
  "claude-opus-4": makePricing(15.0, 75.0),
  "claude-sonnet-4": makePricing(3.0, 15.0),
  "claude-sonnet-4-20250514": makePricing(3.0, 15.0),
  "claude-opus-4-20250514": makePricing(15.0, 75.0),
  "claude-3-5-sonnet-20241022": makePricing(3.0, 15.0),
  "claude-3-5-haiku-20241022": makePricing(1.0, 5.0),
  "claude-3-opus-20240229": makePricing(15.0, 75.0),
  "claude-3-sonnet-20240229": makePricing(3.0, 15.0),
  "claude-3-haiku-20240307": makePricing(0.25, 1.25),
  default: makePricing(3.0, 15.0),
};

export function calculateCostMicrodollars(
  model: string, inputTokens: number, outputTokens: number,
  cacheCreationTokens: number = 0, cacheReadTokens: number = 0,
): number {
  const pricing = PRICING[model] ?? PRICING.default;
  return Math.round(
    inputTokens * pricing.input + outputTokens * pricing.output +
    cacheCreationTokens * pricing.cacheCreation + cacheReadTokens * pricing.cacheRead
  );
}
