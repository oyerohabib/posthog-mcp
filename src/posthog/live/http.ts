import {
  PostHogAuthError,
  PostHogNotFoundError,
  PostHogRateLimitError,
  PostHogUpstreamError,
  PostHogValidationError,
} from "../errors.js";

export type HttpRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  retries?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNonRetryable(err: unknown): boolean {
  return (
    err instanceof PostHogAuthError ||
    err instanceof PostHogNotFoundError ||
    err instanceof PostHogValidationError
  );
}

/**
 * Fetch with limited retries/backoff for 429 and 5xx.
 * Maps common HTTP statuses to typed PostHog errors.
 */
export async function requestJson<T = unknown>(
  url: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(options.headers ?? {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

      if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => "");
        throw new PostHogAuthError(
          `PostHog auth failed (${res.status}): ${body.slice(0, 200)}`,
        );
      }
      if (res.status === 404) {
        const body = await res.text().catch(() => "");
        throw new PostHogNotFoundError(
          `PostHog resource not found: ${body.slice(0, 200)}`,
        );
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000;
        if (attempt < retries) {
          await sleep(waitMs * (attempt + 1));
          continue;
        }
        throw new PostHogRateLimitError("PostHog rate limit exceeded", waitMs);
      }
      if (res.status >= 500) {
        if (attempt < retries) {
          await sleep(250 * 2 ** attempt);
          continue;
        }
        const body = await res.text().catch(() => "");
        throw new PostHogUpstreamError(
          `PostHog server error (${res.status}): ${body.slice(0, 200)}`,
          res.status,
        );
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new PostHogUpstreamError(
          `PostHog request failed (${res.status}): ${body.slice(0, 200)}`,
          res.status,
        );
      }

      if (res.status === 204) return undefined as T;
      const text = await res.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) throw err;
      const retryable =
        err instanceof TypeError ||
        err instanceof PostHogRateLimitError ||
        (err instanceof PostHogUpstreamError && (err.status ?? 500) >= 500);
      if (retryable && attempt < retries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Convert us.i / eu.i capture hosts to app API hosts. */
export function toAppHost(host: string): string {
  return host
    .replace("://us.i.", "://us.")
    .replace("://eu.i.", "://eu.")
    .replace(/\/$/, "");
}
