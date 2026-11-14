/** Simple fixed-window rate limiter (per key). */

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export class FixedWindowRateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  constructor(opts?: { windowMs?: number; max?: number }) {
    this.windowMs = opts?.windowMs ?? 60_000;
    this.max = opts?.max ?? 120;
  }

  check(key: string, now = Date.now()): RateLimitResult {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return { ok: true };
    }
    if (entry.count >= this.max) {
      const retryAfterSec = Math.ceil(
        (this.windowMs - (now - entry.windowStart)) / 1000,
      );
      return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
    }
    entry.count += 1;
    return { ok: true };
  }

  /** Test helper */
  reset(): void {
    this.hits.clear();
  }
}
