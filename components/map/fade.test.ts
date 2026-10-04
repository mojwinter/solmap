import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FADE_MS, tween } from "./fade";

// A fake animation-frame clock: each flush() advances time and runs the queued frame.
let now = 0;
let queued: FrameRequestCallback | null = null;
const flush = (ms: number) => {
  now += ms;
  const cb = queued;
  queued = null;
  cb?.(now);
};
const reducedMotion = (on: boolean) =>
  vi.stubGlobal("window", { matchMedia: () => ({ matches: on }) as MediaQueryList });

beforeEach(() => {
  now = 0;
  queued = null;
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => ((queued = cb), 1));
  vi.stubGlobal("cancelAnimationFrame", () => (queued = null));
  reducedMotion(false);
});
afterEach(() => vi.unstubAllGlobals());

describe("tween (Satellite ⇄ Sun exposure crossfade)", () => {
  it("eases 0 → 1 over FADE_MS: slow start, halfway at the midpoint, done at the end", () => {
    const seen: number[] = [];
    tween((t) => seen.push(t));
    flush(FADE_MS * 0.25);
    flush(FADE_MS * 0.25);
    flush(FADE_MS * 0.5);
    expect(seen[0]).toBeCloseTo(0.125, 5); // ease-in: a quarter of the time, an eighth of the way
    expect(seen[1]).toBeCloseTo(0.5, 5);
    expect(seen[2]).toBe(1);
    expect(queued).toBeNull(); // stops once it reaches the end
  });

  it("can be cancelled mid-way (e.g. switching back before the fade ends)", () => {
    const seen: number[] = [];
    const cancel = tween((t) => seen.push(t));
    flush(FADE_MS * 0.5);
    cancel();
    flush(FADE_MS);
    expect(seen).toEqual([0.5]);
  });

  it("jumps straight to the end with prefers-reduced-motion", () => {
    reducedMotion(true);
    const seen: number[] = [];
    tween((t) => seen.push(t));
    expect(seen).toEqual([1]);
    expect(queued).toBeNull();
  });
});
