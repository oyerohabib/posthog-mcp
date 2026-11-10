/** Shared pacing + 429 backoff helpers for provider free-tier TPM limits. */

let activeTpmLimit = Number(process.env.GROQ_TPM_LIMIT ?? "8000");
let activeLabel = "llm";
let windowTokens = 0;
let windowStartedAt = Date.now();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Configure TPM budget for the active provider (call once per eval run). */
export function configureRateLimit(opts: {
  tpmLimit: number;
  label?: string;
}): void {
  activeTpmLimit = opts.tpmLimit;
  activeLabel = opts.label ?? "llm";
  windowTokens = 0;
  windowStartedAt = Date.now();
}

/** Parse provider "Please try again in 3.735s" (or ms) from error text. */
export function parseRetryAfterMs(message: string): number | null {
  const sec = message.match(/try again in\s+([\d.]+)\s*s/i);
  if (sec) return Math.ceil(Number(sec[1]) * 1000);
  const ms = message.match(/try again in\s+([\d.]+)\s*ms/i);
  if (ms) return Math.ceil(Number(ms[1]));
  return null;
}

export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate limit|tpm|tokens per minute|resource_exhausted|quota/i.test(
    msg,
  );
}

/** Transient provider failures worth retrying (429, 503 high demand, etc.). */
export function isTransientLlmError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    isRateLimitError(err) ||
    /503|502|504|high demand|try again later|unavailable|overloaded|temporarily/i.test(
      msg,
    ) ||
    /timeout|network|ECONNRESET|ECONNREFUSED|fetch failed/i.test(msg)
  );
}

/**
 * Wait until the rolling 60s TPM budget can fit `estimateTokens`.
 */
export async function awaitTpmBudget(estimateTokens: number): Promise<void> {
  const tpm = activeTpmLimit;
  const now = Date.now();
  if (now - windowStartedAt >= 60_000) {
    windowTokens = 0;
    windowStartedAt = now;
  }
  if (windowTokens + estimateTokens <= tpm) return;

  const waitMs = Math.max(0, 60_000 - (now - windowStartedAt)) + 250;
  console.error(
    `[${activeLabel}] TPM pacing: waiting ${(waitMs / 1000).toFixed(1)}s (used≈${windowTokens}/${tpm})`,
  );
  await sleep(waitMs);
  windowTokens = 0;
  windowStartedAt = Date.now();
}

export function recordTokenUsage(
  promptTokens: number,
  completionTokens: number,
): void {
  const now = Date.now();
  if (now - windowStartedAt >= 60_000) {
    windowTokens = 0;
    windowStartedAt = now;
  }
  windowTokens += promptTokens + completionTokens;
}

/** Retry delay: prefer provider's suggested wait, else exponential backoff. */
export async function backoffForError(
  err: unknown,
  attempt: number,
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  const parsed = parseRetryAfterMs(msg);
  // 503 "high demand" often needs longer cool-downs than TPM 429s.
  const highDemand = /503|high demand|overloaded|try again later/i.test(msg);
  const base = highDemand ? 5000 * 2 ** attempt : 1000 * 2 ** attempt;
  const waitMs =
    parsed != null ? parsed + 500 : Math.min(60_000, base);
  console.error(
    `[${activeLabel}] retry ${attempt + 1} after ${(waitMs / 1000).toFixed(1)}s`,
  );
  await sleep(waitMs);
}

/** Delay between eval tasks to stay under free-tier TPM. */
export async function paceBetweenTasks(lastPromptTokens: number): Promise<void> {
  const floor = activeTpmLimit >= 100_000 ? 1500 : 2000;
  const estimate = Math.max(lastPromptTokens, floor);
  await awaitTpmBudget(estimate);
}
