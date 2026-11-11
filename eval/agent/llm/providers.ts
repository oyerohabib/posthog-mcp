import { createOpenAiCompatClient } from "./openai-compat.js";
import type { LlmClient, ProviderConfig, ProviderId } from "./types.js";

const PROVIDERS: ProviderId[] = ["groq", "gemini"];

function hasKey(envName: string): boolean {
  return Boolean(process.env[envName]?.trim());
}

/**
 * Resolve active provider from CLI override, EVAL_PROVIDER, or available keys.
 * Prefer gemini when its key is set (better free-tier TPM); else groq.
 */
export function resolveProviderConfig(opts?: {
  provider?: string;
}): ProviderConfig {
  const explicit = (opts?.provider ?? process.env.EVAL_PROVIDER ?? "")
    .trim()
    .toLowerCase();

  let id: ProviderId;
  if (explicit) {
    if (explicit !== "groq" && explicit !== "gemini") {
      throw new Error(
        `Unknown EVAL_PROVIDER/provider "${explicit}". Use: ${PROVIDERS.join(", ")}`,
      );
    }
    id = explicit;
  } else if (hasKey("GEMINI_API_KEY")) {
    id = "gemini";
  } else if (hasKey("GROQ_API_KEY")) {
    id = "groq";
  } else {
    throw new Error(
      "No LLM provider configured. Set GEMINI_API_KEY or GROQ_API_KEY (and optionally EVAL_PROVIDER=gemini|groq).",
    );
  }

  if (id === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required when provider=gemini");
    }
    return {
      id: "gemini",
      label: "Gemini",
      apiKey,
      baseURL:
        process.env.GEMINI_BASE_URL?.trim() ||
        "https://generativelanguage.googleapis.com/v1beta/openai",
      // gemini-2.5-flash is blocked for new keys; 3.5 Flash-Lite is the capacity-friendly default.
      // Override with GEMINI_MODEL=gemini-3.8-flash when you want the stronger Flash model.
      model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
      tpmLimit: Number(process.env.GEMINI_TPM_LIMIT ?? "250000"),
    };
  }

  const apiKey = process.env.GROQ_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required when provider=groq");
  }
  return {
    id: "groq",
    label: "Groq",
    apiKey,
    baseURL:
      process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
    model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
    tpmLimit: Number(process.env.GROQ_TPM_LIMIT ?? "8000"),
  };
}

export function createLlmClient(config: ProviderConfig): LlmClient {
  return createOpenAiCompatClient({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    label: config.label,
  });
}
