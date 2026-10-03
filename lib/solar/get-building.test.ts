import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/solar/building/route";
import { DEFAULT_ERROR_MESSAGES, getBuilding } from "./get-building";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const mockFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getBuilding: status mapping", () => {
  it("calls the building route with lat/lng and returns the building on 200", async () => {
    const building = { buildingId: "buildings/x", center: { lat: 49.25, lng: -123.15 }, configs: [], source: "fixture" };
    const fetch = mockFetch(async () => json(building, 200));
    const r = await getBuilding(49.25, -123.15);
    expect(r).toEqual({ ok: true, building });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("/api/solar/building?lat=49.25&lng=-123.15");
  });

  it.each([
    [400, "BAD_REQUEST", { error: "BAD_REQUEST", message: "lat must be between 48.2 and 60 (inside BC)" }],
    [404, "NO_COVERAGE", { error: "NO_COVERAGE", message: "That building is outside BC, and Solmap only covers BC." }],
    [502, "UPSTREAM", { error: "UPSTREAM", message: "The solar data service didn't answer. Please try again in a minute." }],
    [503, "UPSTREAM", { error: "UPSTREAM", message: "daily limit reached" }],
  ] as const)("%i → %s, keeping the server's message", async (status, error, body) => {
    mockFetch(async () => json(body, status));
    expect(await getBuilding(49.25, -123.15)).toEqual({ ok: false, error, message: body.message });
  });

  it("429 → RATE_LIMITED with a default message (the route sends none)", async () => {
    mockFetch(async () => json({ error: "RATE_LIMITED" }, 429, { "Retry-After": "12" }));
    expect(await getBuilding(49.25, -123.15)).toEqual({ ok: false, error: "RATE_LIMITED", message: DEFAULT_ERROR_MESSAGES.RATE_LIMITED });
  });

  it("anything else (403 from the Access check, 500, non-JSON) → UPSTREAM", async () => {
    mockFetch(async () => json({ error: "FORBIDDEN" }, 403));
    expect(await getBuilding(49.25, -123.15)).toMatchObject({ ok: false, error: "UPSTREAM" });
    mockFetch(async () => new Response("<html>Bad gateway</html>", { status: 500 }));
    expect(await getBuilding(49.25, -123.15)).toEqual({ ok: false, error: "UPSTREAM", message: DEFAULT_ERROR_MESSAGES.UPSTREAM });
  });

  it("a 200 that isn't a BuildingResponse → UPSTREAM", async () => {
    mockFetch(async () => new Response("<html>login</html>", { status: 200 }));
    expect(await getBuilding(49.25, -123.15)).toMatchObject({ ok: false, error: "UPSTREAM" });
    mockFetch(async () => json({ hello: "world" }, 200));
    expect(await getBuilding(49.25, -123.15)).toMatchObject({ ok: false, error: "UPSTREAM" });
  });

  it("a network failure → UPSTREAM with a connection message", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const r = await getBuilding(49.25, -123.15);
    expect(r).toMatchObject({ ok: false, error: "UPSTREAM" });
    expect(!r.ok && r.message).toMatch(/connection/);
  });

  it("an abort rejects instead of becoming an error state", async () => {
    mockFetch(async (_url, init) => {
      init?.signal?.throwIfAborted();
      return json({}, 200);
    });
    const ctl = new AbortController();
    ctl.abort();
    await expect(getBuilding(49.25, -123.15, { signal: ctl.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("non-finite coordinates → BAD_REQUEST without a request", async () => {
    const fetch = mockFetch(async () => json({}, 200));
    expect(await getBuilding(NaN, -123.15)).toMatchObject({ ok: false, error: "BAD_REQUEST" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("imports types only, so it's safe in a client component", () => {
    const src = readFileSync(path.join(__dirname, "get-building.ts"), "utf8");
    const imports = src.match(/^import .*$/gm) ?? [];
    expect(imports.every((l) => l.startsWith("import type "))).toBe(true);
  });
});

describe("getBuilding against the real route (SOLAR_SOURCE=fixtures)", () => {
  const cacheDir = mkdtempSync(path.join(tmpdir(), "get-building-"));
  const env = { ...process.env };
  const resetSingletons = () => {
    const g = globalThis as { __solarStore?: unknown; __solarRateLimiter?: unknown; __solarDailyBudget?: unknown; __solarDiskQuota?: unknown };
    delete g.__solarStore;
    delete g.__solarRateLimiter;
    delete g.__solarDailyBudget;
    delete g.__solarDiskQuota;
  };

  beforeAll(() => {
    resetSingletons();
    process.env.SOLAR_SOURCE = "fixtures";
    process.env.SOLAR_CACHE_DIR = cacheDir;
  });
  afterAll(() => {
    process.env = env;
    resetSingletons();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  const viaRoute = () => mockFetch((url) => GET(new Request(`http://localhost${url}`)));

  it("a synthetic roof → ok", async () => {
    viaRoute();
    const r = await getBuilding(49.25, -123.15);
    expect(r.ok).toBe(true);
    expect(r.ok && r.building.source).toBe("fixture");
  });

  it("the no-coverage demo point → NO_COVERAGE", async () => {
    viaRoute();
    expect(await getBuilding(53.9171, -122.7497)).toMatchObject({ ok: false, error: "NO_COVERAGE" });
  });

  it("outside BC → BAD_REQUEST", async () => {
    viaRoute();
    expect(await getBuilding(45, -75)).toMatchObject({ ok: false, error: "BAD_REQUEST" });
  });
});
