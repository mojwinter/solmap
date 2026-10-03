import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as heatmapGET } from "@/app/api/solar/heatmap/route";
import { GET as layersGET } from "@/app/api/solar/layers/route";

const cacheDir = mkdtempSync(path.join(tmpdir(), "solar-layers-route-"));
const env = { ...process.env };
let ipSeq = 0;
const req = (route: string, query: string) =>
  new Request(`http://localhost/api/solar/${route}?${query}`, { headers: { "x-forwarded-for": `198.51.100.${++ipSeq}` } });

const resetSingletons = () => {
  const g = globalThis as { __solarStore?: unknown; __solarLayersStore?: unknown; __solarRateLimiter?: unknown; __solarLayersRateLimiter?: unknown };
  delete g.__solarStore;
  delete g.__solarLayersStore;
  delete g.__solarRateLimiter;
  delete g.__solarLayersRateLimiter;
};

beforeAll(() => {
  resetSingletons();
  process.env.SOLAR_SOURCE = "fixtures";
  process.env.SOLAR_CACHE_DIR = cacheDir;
  process.env.RATE_LIMIT_PER_MINUTE = "100";
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
  process.env = env;
  resetSingletons();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("GET /api/solar/layers + /api/solar/heatmap (SOLAR_SOURCE=fixtures)", () => {
  it("200 SolarLayersResponse for a synthetic roof, then its PNG", async () => {
    const res = await layersGET(req("layers", "lat=49.25&lng=-123.15"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      buildingId: "buildings/SYNTHETIC-south-gable",
      imagery: { quality: "HIGH", date: "2024-08-15" },
      fluxScale: { min: 400, max: 1400, unit: "kWh/kW/yr" },
      source: "fixture",
    });
    expect(body.heatmapUrl).toMatch(/^\/api\/solar\/heatmap\?id=[0-9a-f]{32}$/);
    expect(body.bounds.sw.lat).toBeLessThan(49.25);
    expect(body.bounds.ne.lat).toBeGreaterThan(49.25);

    const png = await heatmapGET(req("heatmap", body.heatmapUrl.split("?")[1]));
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(png.headers.get("cache-control")).toBe("private, no-store");
    const img = PNG.sync.read(Buffer.from(await png.arrayBuffer()));
    expect(img.width).toBeGreaterThan(10);
  });

  it("404 NO_COVERAGE where there's no roof", async () => {
    const res = await layersGET(req("layers", "lat=53.9171&lng=-122.7497"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "NO_COVERAGE" });
  });

  it("400 for coordinates outside BC", async () => {
    expect((await layersGET(req("layers", "lat=47&lng=-122"))).status).toBe(400);
  });

  it("/layers has its own stricter bucket: 3 a minute per IP by default (C1)", async () => {
    const one = (ip: string) =>
      layersGET(new Request("http://localhost/api/solar/layers?lat=49.25&lng=-123.15", { headers: { "x-forwarded-for": ip } }));
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await one("203.0.113.50")).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect((await one("203.0.113.51")).status).toBe(200);
  });

  it("heatmap: 400 for a malformed id, 404 for an unknown one", async () => {
    const bad = await heatmapGET(req("heatmap", "id=https%3A%2F%2Fsolar.googleapis.com%2Fv1%2FgeoTiff%3Aget"));
    expect(bad.status).toBe(400);
    expect(bad.headers.get("cache-control")).toBe("private, no-store");
    const unknown = await heatmapGET(req("heatmap", `id=${"f".repeat(32)}`));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: "NO_COVERAGE" });
  });
});
