/**
 * Per-IP token bucket for /api/solar/* (RATE_LIMIT_PER_MINUTE). In-process only: we run one
 * container per env, so no shared store is needed (docs/INFRA.md → Caching and rate limiting).
 */

export interface RateLimiter {
  /** Takes one token for `key`. When empty, says how long until the next token. */
  take(key: string): { ok: true } | { ok: false; retryAfterSeconds: number };
}

const DEFAULT_PER_MINUTE = 30;
const SWEEP_EVERY_MS = 60_000;

export function createRateLimiter(perMinute: number, now: () => number = Date.now): RateLimiter {
  const capacity = Number.isFinite(perMinute) && perMinute > 0 ? perMinute : DEFAULT_PER_MINUTE;
  const refillPerMs = capacity / 60_000;
  const buckets = new Map<string, { tokens: number; at: number }>();
  let lastSweep = now();

  const refill = (b: { tokens: number; at: number }, t: number) => {
    b.tokens = Math.min(capacity, b.tokens + (t - b.at) * refillPerMs);
    b.at = t;
  };

  return {
    take(key) {
      const t = now();
      if (t - lastSweep > SWEEP_EVERY_MS) {
        // Forget anyone whose bucket has refilled; they'd start full anyway.
        for (const [k, b] of buckets) {
          refill(b, t);
          if (b.tokens >= capacity) buckets.delete(k);
        }
        lastSweep = t;
      }
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { tokens: capacity, at: t }));
      refill(b, t);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true };
      }
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - b.tokens) / refillPerMs / 1000)) };
    },
  };
}

/**
 * The client IP: the FIRST X-Forwarded-For entry. Safe only because Caddy sits in front and
 * replaces untrusted incoming X-Forwarded-For headers. Without a proxy (local dev) everyone is "local".
 */
export function clientIp(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "local";
}

const globalForLimiter = globalThis as typeof globalThis & { __solarRateLimiter?: RateLimiter };

/** One limiter shared by every /api/solar/* route. */
export function getSolarRateLimiter(): RateLimiter {
  globalForLimiter.__solarRateLimiter ??= createRateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE));
  return globalForLimiter.__solarRateLimiter;
}
