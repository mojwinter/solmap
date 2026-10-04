/**
 * Per-IP token buckets for /api/solar/* (RATE_LIMIT_PER_MINUTE). In-process only: we run one
 * container per env, so no shared store is needed (docs/INFRA.md → Caching and rate limiting).
 *
 * Only work worth limiting takes a token (#58): the stores run a Gate just before a Google call (or,
 * for the layers bucket, a render), so cached roofs are free and a room behind one venue IP isn't blocked.
 */

export interface RateLimiter {
  /** Takes one token for `key`. When empty, says how long until the next token. */
  take(key: string): { ok: true } | { ok: false; retryAfterSeconds: number };
}

/** Thrown by a Gate when the caller's bucket is empty; the routes answer 429 RATE_LIMITED. */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`rate limited (retry after ${retryAfterSeconds}s)`);
    this.name = "RateLimitedError";
  }
}

/** Run by a store just before the work it guards; throws RateLimitedError to refuse it. */
export type Gate = () => void;

/** A Gate that takes one token from `key`'s bucket. */
export function gate(limiter: RateLimiter, key: string): Gate {
  return () => {
    const r = limiter.take(key);
    if (!r.ok) throw new RateLimitedError(r.retryAfterSeconds);
  };
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
 * The client IP, in order:
 * 1. `CF-Connecting-IP`: prod sits behind Cloudflare (proxied), so the TCP peer Caddy sees, and
 *    writes into X-Forwarded-For, is a Cloudflare edge shared by everyone at the same PoP.
 *    Caveat: the origin is still reachable without Cloudflare, so someone bypassing it can spoof
 *    this header and dodge the limit. Fine for a hackathon (the real caps are the Google quotas);
 *    locking the origin to Cloudflare's IPs is a box-wide puckbank decision.
 * 2. The first X-Forwarded-For entry (Caddy replaces untrusted incoming XFF with the TCP peer).
 * 3. "local": no proxy (local dev), everyone shares one bucket.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return cf || first || headers.get("x-real-ip")?.trim() || "local";
}

const globalForLimiter = globalThis as typeof globalThis & { __solarRateLimiter?: RateLimiter };

/** One limiter shared by every /api/solar/* route: building lookups that reach Google. */
export function getSolarRateLimiter(): RateLimiter {
  globalForLimiter.__solarRateLimiter ??= createRateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE));
  return globalForLimiter.__solarRateLimiter;
}

const globalForLayersLimiter = globalThis as typeof globalThis & { __solarLayersRateLimiter?: RateLimiter };

/**
 * A second, stricter bucket for /api/solar/layers lookups and heatmap renders that miss memory (security
 * review C1): one miss can cost a Data Layers call ($0.075), two raster downloads and a render, or a disk
 * read + render. Memory hits are free. RATE_LIMIT_LAYERS_PER_MINUTE, default 3.
 */
export function getLayersRateLimiter(): RateLimiter {
  const n = Number(process.env.RATE_LIMIT_LAYERS_PER_MINUTE);
  globalForLayersLimiter.__solarLayersRateLimiter ??= createRateLimiter(Number.isFinite(n) && n > 0 ? n : 3);
  return globalForLayersLimiter.__solarLayersRateLimiter;
}
