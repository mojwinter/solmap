/**
 * Writes the synthetic roofs in scripts/synthetic-roofs.ts to fixtures/synthetic/<name>.json.
 *
 *   pnpm tsx scripts/make-synthetic.ts                   # write every roof that changed
 *   pnpm tsx scripts/make-synthetic.ts --only flat-roof  # just these (comma-separated)
 *   pnpm tsx scripts/make-synthetic.ts --check           # exit 1 if any file is out of date; writes nothing
 *
 * Roofs marked `frozen` (south-gable, shaded-gable: fixtures/finance-golden.json uses them) are
 * never overwritten; if the generator's output for them drifts, the script says so and exits 1.
 * Dev-only, no Google calls, no dependencies beyond Node.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOFS, renderRoof } from "./synthetic-roofs";

const args = process.argv.slice(2);
const check = args.includes("--check");
const onlyArg = args.indexOf("--only");
const only = onlyArg >= 0 ? (args[onlyArg + 1] ?? "").split(",").filter(Boolean) : null;

const unknown = (only ?? []).filter((n) => !ROOFS.some((r) => r.name === n));
if (unknown.length) {
  console.error(`Unknown roof(s): ${unknown.join(", ")}. Known: ${ROOFS.map((r) => r.name).join(", ")}`);
  process.exit(2);
}

const dir = path.join(process.cwd(), "fixtures", "synthetic");
mkdirSync(dir, { recursive: true });

let failed = false;
for (const spec of ROOFS) {
  if (only && !only.includes(spec.name)) continue;
  const file = path.join(dir, `${spec.name}.json`);
  const text = renderRoof(spec);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  const panels = (JSON.parse(text) as { solarPotential: { maxArrayPanelsCount: number } }).solarPotential.maxArrayPanelsCount;
  const label = `${spec.name.padEnd(14)} ${String(panels).padStart(3)} panels  ${spec.lat}, ${spec.lng}`;

  if (current === text) {
    console.log(`unchanged  ${label}`);
  } else if (spec.frozen && current !== null) {
    console.error(`DIFFERS    ${label}  (frozen: finance-golden.json uses it, not written)`);
    failed = true;
  } else if (check) {
    console.error(`${current === null ? "MISSING " : "STALE   "}   ${label}`);
    failed = true;
  } else {
    writeFileSync(file, text); // the text is LF-only
    console.log(`${current === null ? "created" : "updated"}    ${label}`);
  }
}
process.exit(failed ? 1 : 0);
