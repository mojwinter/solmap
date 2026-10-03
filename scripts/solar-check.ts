/**
 * `pnpm solar:check`: the pre-event quality test (PLAN.md → Pre-event checklist). Uses the real key,
 * makes at most 10 billable findClosest calls, and prints the REQUIRED_QUALITY and
 * SOLAR_EXPANDED_COVERAGE values to use, a schema check of every 200, and a shape diff (field paths,
 * never values) of real responses vs fixtures/synthetic/*.json. Writes nothing to disk.
 *
 *   pnpm solar:check                       # points from fixtures/bank.json
 *   pnpm solar:check -- --file other.json  # same {label, lat, lng, region} shape
 *
 * Known-good point = the first "Metro Vancouver" entry; 404 test points = up to 3 "Rural" entries.
 * Runs with `tsx --conditions=react-server` so lib/solar's `import "server-only"` resolves.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fieldPaths, MAX_CHECK_CALLS, runSolarCheck, shapeDiff, type CheckPoint } from "@/lib/solar/check";
import { callFindClosest, REQUIRED_QUALITY } from "@/lib/solar/client";

interface BankEntry extends CheckPoint {
  region?: string;
}

async function main() {
  for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
  if (!process.env.SOLAR_API_KEY) {
    console.error("SOLAR_API_KEY is not set (env, .env.local or .env). solar:check needs the real server key; nothing was called.");
    process.exit(2);
  }

  const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--"));
  const { values } = parseArgs({ args: argv, options: { file: { type: "string", default: "fixtures/bank.json" } } });
  const bank: BankEntry[] = JSON.parse(readFileSync(values.file!, "utf8"));
  const knownGood = bank.find((b) => b.region === "Metro Vancouver");
  const rural = bank.filter((b) => b.region === "Rural").slice(0, 3);
  if (!knownGood || rural.length === 0) {
    console.error(`${values.file} needs a "Metro Vancouver" entry and at least one "Rural" entry.`);
    process.exit(2);
  }

  console.log(`solar:check: REQUIRED_QUALITY=${REQUIRED_QUALITY}, budget ${MAX_CHECK_CALLS} calls`);
  console.log(`  known-good: ${knownGood.label}; 404 tests: ${rural.map((r) => r.label).join(", ")}\n`);
  const report = await runSolarCheck({ knownGood, rural }, (req) => callFindClosest(req), { requiredQuality: REQUIRED_QUALITY });

  for (const s of report.steps) {
    const req = `${s.requiredQuality}${s.experiments.length ? "+" + s.experiments.join(",") : ""}`;
    const got = s.status === 200 ? `200 ${s.imageryQuality ?? "?"}` : s.status === 404 ? "404" : `ERROR ${s.status} ${s.error ?? ""}`;
    const schema = s.schema === undefined ? "" : s.schema === "ok" ? "  schema ok" : `  SCHEMA FAILED: ${s.schema.join("; ")}`;
    console.log(`  test ${s.test}  ${s.label.padEnd(28)} ${req.padEnd(24)} → ${got}${schema}`);
  }

  if (report.bodies.length) {
    const dir = path.join(process.cwd(), "fixtures/synthetic");
    const synthetic = new Set<string>();
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const { _note, ...body } = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      void _note;
      fieldPaths(body, "", synthetic);
    }
    const real = new Set<string>();
    for (const b of report.bodies) fieldPaths(b, "", real);
    const diff = shapeDiff(real, synthetic);
    console.log(`\nShape diff (field paths only), ${report.bodies.length} real response(s) vs fixtures/synthetic:`);
    console.log(`  only in real (${diff.onlyInReal.length}):${diff.onlyInReal.map((p) => `\n    + ${p}`).join("") || " none"}`);
    console.log(`  only in synthetic (${diff.onlyInSynthetic.length}):${diff.onlyInSynthetic.map((p) => `\n    - ${p}`).join("") || " none"}`);
  }

  console.log(`\nNotes:${report.notes.map((n) => `\n  - ${n}`).join("") || " none"}`);
  console.log(`\nBillable calls: ${report.calls} / ${MAX_CHECK_CALLS}`);
  console.log("Recommended:");
  console.log(`  REQUIRED_QUALITY = ${report.recommendedQuality ?? "undecided"}   (lib/solar/client.ts)`);
  console.log(`  SOLAR_EXPANDED_COVERAGE = ${report.recommendedExpandedCoverage === null ? "undecided" : report.recommendedExpandedCoverage ? 1 : 0}   (.env)`);
  if (report.recommendedQuality === null) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
