/**
 * The pre-event quality test behind `pnpm solar:check` (PLAN.md → Pre-event checklist). Decides two
 * settings with at most MAX_CHECK_CALLS billable findClosest calls:
 *
 *   1. REQUIRED_QUALITY: a known-good Vancouver point at the current constant. If Google rejects it
 *      with 400, retry once at MEDIUM and recommend that.
 *   2. SOLAR_EXPANDED_COVERAGE: rural points that should 404; each 404 is retried once with
 *      experiments=EXPANDED_COVERAGE&requiredQuality=BASE. Any building back → turn it on.
 *
 * Every 200 is checked against buildingInsightsSchema, and its field *paths* (never values) are
 * compared with the synthetic roofs, so we learn whether our fixtures look like real responses.
 * The Google call is injected: tests pass a fake, the script passes callFindClosest.
 */
import type { ImageryQuality } from "@/src/types/solar";
import { EXPANDED_COVERAGE_QUALITY, UpstreamError, type FindClosestRequest, type GoogleCallResult } from "./client";
import { buildingInsightsSchema } from "./schema";

export const MAX_CHECK_CALLS = 10;
const FALLBACK_QUALITY: ImageryQuality = "MEDIUM";

export interface CheckPoint {
  label: string;
  lat: number;
  lng: number;
}

export interface CheckStep {
  test: 1 | 2;
  label: string;
  requiredQuality: ImageryQuality;
  experiments: string[];
  /** 200, 404, or Google's error status (400, 403, 429…; 0 = network). */
  status: number;
  imageryQuality?: ImageryQuality;
  /** For 200s: "ok", or the schema issues as `path: code` (no values). */
  schema?: string[] | "ok";
  error?: string;
}

export interface CheckReport {
  calls: number;
  steps: CheckStep[];
  /** null = couldn't decide (key/IP/network problem). */
  recommendedQuality: ImageryQuality | null;
  recommendedExpandedCoverage: boolean | null;
  notes: string[];
  /** Raw 200 bodies, for the shape diff. Kept in memory only. */
  bodies: unknown[];
}

class BudgetExceeded extends Error {}

export async function runSolarCheck(
  plan: { knownGood: CheckPoint; rural: CheckPoint[] },
  call: (req: FindClosestRequest) => Promise<GoogleCallResult>,
  opts: { requiredQuality: ImageryQuality; maxCalls?: number },
): Promise<CheckReport> {
  const maxCalls = Math.min(opts.maxCalls ?? MAX_CHECK_CALLS, MAX_CHECK_CALLS);
  const report: CheckReport = { calls: 0, steps: [], recommendedQuality: null, recommendedExpandedCoverage: null, notes: [], bodies: [] };

  async function step(test: 1 | 2, p: CheckPoint, requiredQuality: ImageryQuality, experiments: "EXPANDED_COVERAGE"[]): Promise<CheckStep> {
    if (report.calls >= maxCalls) throw new BudgetExceeded(`call budget of ${maxCalls} reached`);
    report.calls++;
    const s: CheckStep = { test, label: p.label, requiredQuality, experiments, status: 0 };
    try {
      const res = await call({ lat: p.lat, lng: p.lng, requiredQuality, experiments });
      s.status = res.status;
      if (res.status === 200) {
        report.bodies.push(res.body);
        const parsed = buildingInsightsSchema.safeParse(res.body);
        s.schema = parsed.success ? "ok" : parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`);
        if (parsed.success) s.imageryQuality = parsed.data.imageryQuality;
      }
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e;
      s.status = e.upstreamStatus ?? 0;
      s.error = e.message;
    }
    report.steps.push(s);
    return s;
  }

  try {
    // Test 1: is our minimum quality accepted?
    const q = opts.requiredQuality;
    const first = await step(1, plan.knownGood, q, []);
    if (first.status === 200 || first.status === 404) {
      report.recommendedQuality = q;
      if (first.status === 404) report.notes.push(`The known-good point 404'd at ${q}. ${q} is accepted, but pick a better-covered point.`);
    } else if (first.status === 400 && q !== FALLBACK_QUALITY) {
      report.notes.push(`Google rejected requiredQuality=${q} (400). Trying ${FALLBACK_QUALITY}.`);
      const second = await step(1, plan.knownGood, FALLBACK_QUALITY, []);
      if (second.status === 200 || second.status === 404) report.recommendedQuality = FALLBACK_QUALITY;
    }
    if (report.recommendedQuality === null) {
      report.notes.push("Test 1 failed with an error that isn't about quality (key, IP restriction, quota or network). Fix that first; skipped test 2.");
      return report;
    }

    // Test 2: do rural 404s come back with EXPANDED_COVERAGE + BASE?
    let retried = 0;
    let hits = 0;
    let rejected = 0;
    for (const p of plan.rural) {
      const base = await step(2, p, report.recommendedQuality, []);
      if (base.status === 200) {
        report.notes.push(`${p.label} has coverage at ${report.recommendedQuality} already (not a 404 test point).`);
        continue;
      }
      if (base.status !== 404) continue;
      retried++;
      const exp = await step(2, p, EXPANDED_COVERAGE_QUALITY, ["EXPANDED_COVERAGE"]);
      if (exp.status === 200) hits++;
      else if (exp.status === 400 || exp.status === 403) rejected++;
    }
    if (retried === 0) {
      report.notes.push("No rural point 404'd, so EXPANDED_COVERAGE couldn't be tested. Leaving it off.");
      report.recommendedExpandedCoverage = false;
    } else {
      report.recommendedExpandedCoverage = hits > 0;
      if (rejected) report.notes.push(`${rejected} EXPANDED_COVERAGE retr${rejected === 1 ? "y was" : "ies were"} rejected (experiment not enabled for this key/region?).`);
      report.notes.push(`EXPANDED_COVERAGE returned a building for ${hits} of ${retried} rural 404(s).`);
    }
  } catch (e) {
    if (!(e instanceof BudgetExceeded)) throw e;
    report.notes.push(e.message);
  }
  return report;
}

/** Every field path in a JSON value; arrays become `[]` (union over their elements). Values are dropped. */
export function fieldPaths(value: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    const p = `${prefix}[]`;
    out.add(p);
    for (const v of value) fieldPaths(v, p, out);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) fieldPaths(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) {
    out.add(prefix);
  }
  return out;
}

/** Paths present in real responses but not in the fixtures, and the reverse. */
export function shapeDiff(real: Iterable<string>, synthetic: Iterable<string>) {
  const r = new Set(real);
  const s = new Set(synthetic);
  return {
    onlyInReal: [...r].filter((p) => !s.has(p)).sort(),
    onlyInSynthetic: [...s].filter((p) => !r.has(p)).sort(),
  };
}
