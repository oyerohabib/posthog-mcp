import type { LlmClient } from "./types.js";

export type OpenAiCompatOptions = {
  apiKey: string;
  baseURL: string;
  /** Used in error messages, e.g. "Groq" or "Gemini". */
  label: string;
};

/** Minimal OpenAI-compatible chat completions client (fetch only). */
export function createOpenAiCompatClient(
  options: OpenAiCompatOptions,
): LlmClient {
  const base = options.baseURL.replace(/\/$/, "");
  return {
    chat: {
      completions: {
        async create(body) {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(
              `${options.label} API ${res.status}: ${text.slice(0, 300)}`,
            );
          }
          return (await res.json()) as Awaited<
            ReturnType<LlmClient["chat"]["completions"]["create"]>
          >;
        },
      },
    },
  };
}
