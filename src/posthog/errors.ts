/** Typed errors for PostHog mock + live clients. */

export class PostHogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostHogValidationError";
  }
}

export class PostHogAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostHogAuthError";
  }
}

export class PostHogNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostHogNotFoundError";
  }
}

export class PostHogRateLimitError extends Error {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "PostHogRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class PostHogUpstreamError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "PostHogUpstreamError";
    this.status = status;
  }
}

export function errorCode(err: unknown): string {
  if (err instanceof PostHogValidationError) return "validation_error";
  if (err instanceof PostHogAuthError) return "auth_error";
  if (err instanceof PostHogNotFoundError) return "not_found";
  if (err instanceof PostHogRateLimitError) return "rate_limit";
  if (err instanceof PostHogUpstreamError) return "upstream_error";
  return "upstream_error";
}
