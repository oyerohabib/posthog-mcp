/**
 * Back-compat re-exports. Prefer `eval/agent/llm/` for new code.
 */
export type {
  ChatCompletion,
  ChatMessage,
  ChatTool,
  LlmClient as GroqClient,
  ToolCall,
} from "./llm/types.js";
export {
  createLlmClient,
  resolveProviderConfig,
} from "./llm/providers.js";
export { estimateCostUsd as estimateCostUsdForProvider } from "./llm/pricing.js";

import { createLlmClient, resolveProviderConfig } from "./llm/providers.js";
import { estimateCostUsd as estimateCostUsdForProvider } from "./llm/pricing.js";
import type { ProviderConfig } from "./llm/types.js";

/** @deprecated Use resolveProviderConfig({ provider: "groq" }) */
export function loadGroqConfig(): ProviderConfig {
  return resolveProviderConfig({ provider: "groq" });
}

/** @deprecated Use createLlmClient(resolveProviderConfig(...)) */
export function createGroqClient(
  config: ProviderConfig = loadGroqConfig(),
) {
  return createLlmClient(config);
}

/** @deprecated Prefer estimateCostUsd(provider, usage) from llm/pricing */
export function estimateCostUsd(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
}): number {
  return estimateCostUsdForProvider("groq", usage);
}
