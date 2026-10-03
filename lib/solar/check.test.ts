import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fieldPaths, runSolarCheck, shapeDiff } from "./check";
import { callFindClosest } from "./client";

const southGable = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures/synthetic/south-gable.json"), "utf8"));
const GOOD = { label: "Kitsilano CC", lat: 49.26153, lng: -123.16209 };
const R1 = { label: "Dease Lake", lat: 58.43886, lng: -130.01165 };
const R2 = { label: "Atlin", lat: 59.57483, lng: -133.70412 };
const R3 = { label: "Bella Coola", lat: 52.3723, lng: -126.75568 };

type Answer = { status: number; body?: unknown };
const json = (a: Answer) => new Response(JSON.stringify(a.body ?? {}), { status: a.status });
const googleError = (code: number, status: string, message = "x") => ({ status: code, body: { error: { code, status, message } } });
const notFound = googleError(404, "NOT_FOUND");

/** A fake Google behind real callFindClosest: answers by point label + quality + experiment. */
function fakeGoogle(answer: (label: string, quality: string, expanded: boolean) => Answer) {
  const urls: URL[] = [];
  const keys: (string | null)[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    urls.push(url);
    keys.push(new Headers(init?.headers).get("x-goog-api-key"));
    const lat = Number(url.searchParams.get("location.latitude"));
    const label = [GOOD, R1, R2, R3].find((p) => p.lat === lat)!.label;
    return json(answer(label, url.searchParams.get("requiredQuality")!, url.searchParams.getAll("experiments").includes("EXPANDED_COVERAGE")));
  }) as typeof fetch;
  return { urls, keys, call: (req: Parameters<typeof callFindClosest>[0]) => callFindClosest(req, { apiKey: "test-key", fetch: fetchFn }) };
}

const plan = { knownGood: GOOD, rural: [R1, R2, R3] };

describe("runSolarCheck", () => {
  it("LOW accepted, EXPANDED_COVERAGE finds a rural building → LOW + expanded on", async () => {
    const g = fakeGoogle((label, quality, expanded) => {
      if (label === GOOD.label) return { status: 200, body: southGable };
      if (label === R1.label) return expanded ? { status: 200, body: { ...southGable, imageryQuality: "BASE" } } : notFound;
      if (label === R2.label) return notFound;
      return { status: 200, body: southGable }; // R3 already covered
    });
    const r = await runSolarCheck(plan, g.call, { requiredQuality: "LOW" });

    expect(r.recommendedQuality).toBe("LOW");
    expect(r.recommendedExpandedCoverage).toBe(true);
    expect(r.calls).toBe(6); // good, R1 + retry, R2 + retry, R3
    expect(g.urls).toHaveLength(6);
    expect(r.steps.map((s) => [s.label, s.requiredQuality, s.experiments.join(), s.status])).toEqual([
      [GOOD.label, "LOW", "", 200],
      [R1.label, "LOW", "", 404],
      [R1.label, "BASE", "EXPANDED_COVERAGE", 200],
      [R2.label, "LOW", "", 404],
      [R2.label, "BASE", "EXPANDED_COVERAGE", 404],
      [R3.label, "LOW", "", 200],
    ]);
    expect(r.steps.filter((s) => s.status === 200).every((s) => s.schema === "ok")).toBe(true);
    expect(r.bodies).toHaveLength(3);
    // the key goes in a header, never the URL
    expect(g.keys.every((k) => k === "test-key")).toBe(true);
    expect(g.urls.some((u) => u.searchParams.has("key"))).toBe(false);
  });

  it("LOW rejected with 400 → one retry at MEDIUM → recommend MEDIUM", async () => {
    const g = fakeGoogle((label, quality) => {
      if (quality === "LOW") return googleError(400, "INVALID_ARGUMENT", "requiredQuality LOW is not supported");
      return label === GOOD.label ? { status: 200, body: southGable } : notFound;
    });
    const r = await runSolarCheck(plan, g.call, { requiredQuality: "LOW" });
    expect(r.recommendedQuality).toBe("MEDIUM");
    expect(r.steps.slice(0, 2).map((s) => [s.requiredQuality, s.status])).toEqual([
      ["LOW", 400],
      ["MEDIUM", 200],
    ]);
    expect(r.steps.slice(2).every((s) => s.requiredQuality === "MEDIUM" || s.experiments.length)).toBe(true);
    expect(r.recommendedExpandedCoverage).toBe(false);
  });

  it("a key / IP problem stops after test 1 with nothing recommended", async () => {
    const g = fakeGoogle(() => googleError(403, "PERMISSION_DENIED"));
    const r = await runSolarCheck(plan, g.call, { requiredQuality: "LOW" });
    expect(r.recommendedQuality).toBeNull();
    expect(r.recommendedExpandedCoverage).toBeNull();
    expect(r.calls).toBe(1);
    expect(r.steps[0]).toMatchObject({ status: 403 });
  });

  it("EXPANDED_COVERAGE rejected → off, with a note", async () => {
    const g = fakeGoogle((label, quality, expanded) =>
      label === GOOD.label ? { status: 200, body: southGable } : expanded ? googleError(400, "INVALID_ARGUMENT") : notFound,
    );
    const r = await runSolarCheck(plan, g.call, { requiredQuality: "LOW" });
    expect(r.recommendedExpandedCoverage).toBe(false);
    expect(r.notes.join(" ")).toMatch(/rejected/);
  });

  it("no rural 404 → EXPANDED_COVERAGE untested and left off", async () => {
    const g = fakeGoogle(() => ({ status: 200, body: southGable }));
    const r = await runSolarCheck(plan, g.call, { requiredQuality: "LOW" });
    expect(r.recommendedExpandedCoverage).toBe(false);
    expect(r.calls).toBe(4);
    expect(r.notes.join(" ")).toMatch(/couldn't be tested/);
  });

  it("never exceeds the call budget (hard cap 10)", async () => {
    const g = fakeGoogle((label) => (label === GOOD.label ? { status: 200, body: southGable } : notFound));
    const r = await runSolarCheck(plan, g.call, { requiredQuality: "LOW", maxCalls: 3 });
    expect(r.calls).toBe(3);
    expect(g.urls).toHaveLength(3);
    expect(r.notes.join(" ")).toMatch(/budget/);

    const big = await runSolarCheck({ knownGood: GOOD, rural: Array(20).fill(R1) }, fakeGoogle((l) => (l === GOOD.label ? { status: 200, body: southGable } : notFound)).call, {
      requiredQuality: "LOW",
      maxCalls: 50,
    });
    expect(big.calls).toBe(10);
  });

  it("reports schema problems as paths and codes, never values", async () => {
    const broken = { ...southGable, imageryQuality: "SECRET-VALUE", solarPotential: undefined };
    const g = fakeGoogle((label) => (label === GOOD.label ? { status: 200, body: broken } : notFound));
    const r = await runSolarCheck({ knownGood: GOOD, rural: [] }, g.call, { requiredQuality: "LOW" });
    const schema = r.steps[0].schema;
    expect(Array.isArray(schema)).toBe(true);
    expect((schema as string[]).join(" ")).toMatch(/imageryQuality: invalid_value/);
    expect((schema as string[]).join(" ")).toMatch(/solarPotential: invalid_type/);
    expect(JSON.stringify(r.steps)).not.toContain("SECRET-VALUE");
  });
});

describe("fieldPaths / shapeDiff", () => {
  it("lists paths with [] for arrays and no values", () => {
    const paths = fieldPaths({ name: "buildings/secret", a: { b: [{ c: 1 }, { d: 2 }], e: [] } });
    expect([...paths].sort()).toEqual(["a.b[]", "a.b[].c", "a.b[].d", "a.e[]", "name"]);
    expect([...paths].join()).not.toContain("secret");
  });

  it("diffs both ways", () => {
    expect(shapeDiff(["a", "b", "c"], ["b", "c", "d"])).toEqual({ onlyInReal: ["a"], onlyInSynthetic: ["d"] });
  });

  it("finds nested array paths in a synthetic roof", () => {
    const paths = fieldPaths(southGable);
    expect(paths.has("solarPotential.solarPanels[].center.latitude")).toBe(true);
    expect(paths.has("solarPotential.roofSegmentStats[].stats.sunshineQuantiles[]")).toBe(true);
  });
});
