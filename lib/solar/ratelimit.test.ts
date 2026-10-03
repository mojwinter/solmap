import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./ratelimit";

describe("createRateLimiter", () => {
  it("allows a burst of N per minute per key, then refills", () => {
    let t = 0;
    const rl = createRateLimiter(3, () => t);
    expect([rl.take("a"), rl.take("a"), rl.take("a")].every((r) => r.ok)).toBe(true);
    expect(rl.take("a")).toEqual({ ok: false, retryAfterSeconds: 20 });
    expect(rl.take("b").ok).toBe(true);
    t += 20_000; // one token back
    expect(rl.take("a").ok).toBe(true);
    expect(rl.take("a").ok).toBe(false);
  });

  it("falls back to 30/min for a missing or bad setting", () => {
    const rl = createRateLimiter(NaN, () => 0);
    const results = Array.from({ length: 31 }, () => rl.take("x").ok);
    expect(results.filter(Boolean)).toHaveLength(30);
  });
});

describe("clientIp", () => {
  it("prefers CF-Connecting-IP over the Cloudflare edge in X-Forwarded-For", () => {
    const h = new Headers({ "cf-connecting-ip": " 203.0.113.7 ", "x-forwarded-for": "172.70.1.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("two visitors behind the same Cloudflare edge get separate buckets", () => {
    const rl = createRateLimiter(1, () => 0);
    const edge = "172.70.1.1";
    expect(rl.take(clientIp(new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": edge }))).ok).toBe(true);
    expect(rl.take(clientIp(new Headers({ "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": edge }))).ok).toBe(true);
  });

  it("falls back to the first X-Forwarded-For entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "cf-connecting-ip": "", "x-forwarded-for": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
  });

  it("is 'local' with no proxy headers", () => {
    expect(clientIp(new Headers())).toBe("local");
  });
});
