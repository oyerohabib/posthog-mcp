import type { ProviderId } from "./types.js";

/** Approximate USD per 1M tokens. Gemini free-tier estimate is 0. */
const PRICE_PER_MILLION: Record<
  ProviderId,
  { input: number; output: number }
> = {
  groq: { input: 0.15, output: 0.6 },
  gemini: { input: 0, output: 0 },
};

export function estimateCostUsd(
  provider: ProviderId,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
): number {
  if (!usage) return 0;
  const rates = PRICE_PER_MILLION[provider];
  const input = ((usage.prompt_tokens ?? 0) / 1_000_000) * rates.input;
  const output = ((usage.completion_tokens ?? 0) / 1_000_000) * rates.output;
  return input + output;
}
