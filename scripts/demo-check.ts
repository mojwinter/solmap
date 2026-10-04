/**
 * `pnpm demo:check [base-url]`: the release gate behind `/demo-check` (.claude/commands/demo-check.md, #25).
 * Calls the deployed API over HTTP like a browser would (never lib/solar/client.ts: no key here), runs
 * the finance engine on each answer, prints one table and exits 1 if anything was flagged.
 *
 *   pnpm demo:check                                   # https://sunscore.tech, `live` list
 *   pnpm demo:check -- http://127.0.0.1:3100          # localhost → `fixtures` list (SOLAR_SOURCE=fixtures)
 *   pnpm demo:check -- <base> --list live|fixtures    # override the list
 *   pnpm demo:check -- <base> --cache-dir fixtures/solar   # also check disk-cache expiry (VPS / B's machine)
 *
 * List default: `fixtures` when the base host is localhost / 127.0.0.1 / ::1, `live` otherwise. Don't
 * point the `fixtures` list at a cache-mode server: those are real BC coordinates and each one would
 * cost a Google call. `live` rows still at address "TODO" or lat/lng 0 are skipped (and said so); the
 * `live` list fails unless at least MIN_LIVE_ROWS rows were checked, since #25 needs 3 demo addresses.
 *
 * Flags: non-200 (rows expecting NO_COVERAGE must be 404), specific yield outside INSTALL.sanityYield* (below
 * it is fine on rows expected to be weak / not_recommended: that's why they are),
 * verdict ≠ expectedVerdict, responses over SLOW_MS, `source` ≠ "cache" on the `live` list (live = not
 * warmed), and (`live` list, when a cache dir is given via --cache-dir or SOLAR_CACHE_DIR) a demo row whose
 * newest disk entry is missing or expires within EXPIRY_WARN_DAYS.
 *
 * Cloudflare Access: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET from the environment are sent as
 * CF-Access-Client-Id / CF-Access-Client-Secret headers, and never printed or written anywhere.
 * Exit codes: 0 all clear, 1 something flagged, 2 bad usage / nothing to check.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import demo from "@/fixtures/demo-addresses.json";
import { recommend } from "@/lib/finance";
import { DEFAULT_INPUTS, INSTALL } from "@/src/config/bc";
import type { BuildingResponse, RatePlan, Verdict } from "@/src/types/app";

export const DEFAULT_BASE = "https://sunscore.tech";
export const SLOW_MS = 3000;
export const EXPIRY_WARN_DAYS = 3;
export const MIN_LIVE_ROWS = 3;
const TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;
// Mirrors lib/solar/cache.ts (server-only, so not importable here): default and ceiling for
// SOLAR_CACHE_MAX_AGE_DAYS, and how close a cached request must be to count as the same roof.
const DEFAULT_MAX_AGE_DAYS = 25;
const MAX_AGE_CEILING_DAYS = 29;
const MATCH_RADIUS_M = 5;

export type ListName = "live" | "fixtures";
export type Expected = Verdict | "NO_COVERAGE";

export interface DemoRow {
  label: string;
  address?: string;
  lat: number;
  lng: number;
  ratePlan: RatePlan;
  annualKwh: number;
  expectedVerdict: Expected;
}

export interface Fetched {
  status: number;
  ms: number;
  /** Parsed JSON, or undefined when the body wasn't JSON (e.g. an Access login page). */
  body: unknown;
  /** Network error / timeout; status is 0 then. */
  error?: string;
}

export interface RowResult {
  row: DemoRow;
  status: number;
  ms: number;
  source?: string;
  quality?: string;
  configs?: number;
  finance?: {
    panels: number;
    kw: number;
    paybackYears: number | null;
    npv: number;
    exportShare: number;
    specificYield: number;
    verdict: Verdict;
  };
  /** Recommendation with no configs (roof too small): verdict only. */
  verdict?: Verdict;
  flags: string[];
}

export interface CacheEntryMeta {
  file: string;
  fetchedAtMs: number;
  lat: number;
  lng: number;
}

/** Why a row can't be checked yet, or null. */
export function skipReason(row: DemoRow): string | null {
  if (row.address?.trim().toUpperCase() === "TODO") return 'address is still "TODO"';
  if (row.lat === 0 && row.lng === 0) return "lat/lng is still 0";
  return null;
}

export function defaultList(base: string): ListName {
  const host = new URL(base).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1" ? "fixtures" : "live";
}

const isBuilding = (b: unknown): b is BuildingResponse =>
  typeof b === "object" && b !== null && Array.isArray((b as BuildingResponse).configs) && typeof (b as BuildingResponse).source === "string";

/** Pure: one HTTP answer + the finance engine → what to print and what to flag. */
export function evaluateRow(row: DemoRow, res: Fetched, list: ListName): RowResult {
  const out: RowResult = { row, status: res.status, ms: res.ms, flags: [] };
  if (res.ms > SLOW_MS) out.flags.push(`slow: ${(res.ms / 1000).toFixed(1)} s > ${SLOW_MS / 1000} s`);

  if (row.expectedVerdict === "NO_COVERAGE") {
    if (res.status !== 404) out.flags.push(`expected 404 NO_COVERAGE, got ${describeStatus(res)}`);
    return out;
  }
  if (res.status !== 200) {
    out.flags.push(`HTTP ${describeStatus(res)}`);
    return out;
  }
  if (!isBuilding(res.body)) {
    out.flags.push("200 but not a BuildingResponse (Cloudflare Access page?)");
    return out;
  }

  const b = res.body;
  out.source = b.source;
  out.quality = b.imagery?.quality;
  out.configs = b.configs.length;
  if (list === "live" && b.source === "live") out.flags.push("source live: not warmed into the cache");
  if (list === "live" && b.source !== "live" && b.source !== "cache") out.flags.push(`source ${b.source} on the live list`);

  const rec = recommend(b, { ...DEFAULT_INPUTS, ratePlan: row.ratePlan, annualConsumptionKwh: row.annualKwh });
  out.verdict = rec.verdict;
  if (rec.recommendedIndex !== null) {
    const s = rec.scenarios[rec.recommendedIndex];
    out.finance = {
      panels: s.panelsCount,
      kw: s.systemKwDc,
      paybackYears: s.paybackYears,
      npv: s.npv,
      exportShare: s.acKwhYear1 > 0 ? s.year1.exportedKwh / s.acKwhYear1 : 0,
      specificYield: s.specificYield,
      verdict: rec.verdict,
    };
    // Below the band is the point of a row expected to be weak (a shaded roof), so only flag it elsewhere.
    const lowIsExpected = row.expectedVerdict === "weak" || row.expectedVerdict === "not_recommended";
    if ((s.specificYield < INSTALL.sanityYieldMin && !lowIsExpected) || s.specificYield > INSTALL.sanityYieldMax) {
      out.flags.push(`specific yield ${Math.round(s.specificYield)} kWh/kW outside ${INSTALL.sanityYieldMin}–${INSTALL.sanityYieldMax}`);
    }
  }
  if (rec.verdict !== row.expectedVerdict) out.flags.push(`verdict ${rec.verdict}, expected ${row.expectedVerdict}`);
  return out;
}

function describeStatus(res: Fetched): string {
  if (res.status === 0) return `no response (${res.error ?? "network error"})`;
  const err = (res.body as { error?: unknown } | undefined)?.error;
  return typeof err === "string" ? `${res.status} ${err}` : String(res.status);
}

export function clampMaxAgeDays(value: string | undefined): number {
  const n = Number(value);
  if (value === undefined || value === "" || !Number.isFinite(n) || n <= 0) return DEFAULT_MAX_AGE_DAYS;
  return Math.min(n, MAX_AGE_CEILING_DAYS);
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * Pure: for one row, the expiry flag from its newest disk entry (a re-warm leaves the old file until
 * prune). No entry → flagged too, since the demo would then call Google.
 */
export function cacheFlag(row: DemoRow, entries: CacheEntryMeta[], nowMs: number, maxAgeDays: number): string | null {
  const newest = entries
    .filter((e) => distanceM(e, row) <= MATCH_RADIUS_M)
    .sort((a, b) => b.fetchedAtMs - a.fetchedAtMs)[0];
  if (!newest) return "no disk-cache entry: run solar:warm";
  const daysLeft = (newest.fetchedAtMs + maxAgeDays * DAY_MS - nowMs) / DAY_MS;
  if (daysLeft <= 0) return `disk-cache entry expired (${newest.file}): re-warm`;
  if (daysLeft <= EXPIRY_WARN_DAYS) return `disk-cache entry expires in ${daysLeft.toFixed(1)} days (${newest.file}): re-warm`;
  return null;
}

/** Reads `<dir>/building/*.json` headers (fetchedAt + request); unreadable files are skipped. */
export function readCacheEntries(dir: string): CacheEntryMeta[] {
  const sub = path.join(dir, "building");
  const out: CacheEntryMeta[] = [];
  for (const file of readdirSync(sub).filter((f) => f.endsWith(".json"))) {
    try {
      const e = JSON.parse(readFileSync(path.join(sub, file), "utf8")) as { fetchedAt?: string; request?: { lat?: number; lng?: number } };
      const fetchedAtMs = Date.parse(e.fetchedAt ?? "");
      if (Number.isFinite(fetchedAtMs) && typeof e.request?.lat === "number" && typeof e.request?.lng === "number") {
        out.push({ file, fetchedAtMs, lat: e.request.lat, lng: e.request.lng });
      }
    } catch {
      // half-written or foreign file: the server ignores it too
    }
  }
  return out;
}

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-CA")}`;

/** Pure: the compact table, then one line per flag. */
export function formatTable(results: RowResult[]): string {
  const head = ["#", "address", "HTTP", "source", "quality", "cfgs", "ms", "panels", "kW", "kWh/kW", "payback", "NPV", "export", "verdict", "ok"];
  const rows = results.map((r, i) => [
    String(i + 1),
    r.row.label.length > 34 ? r.row.label.slice(0, 33) + "…" : r.row.label,
    r.status === 0 ? "ERR" : String(r.status),
    r.source ?? "",
    r.quality ?? "",
    r.configs === undefined ? "" : String(r.configs),
    String(Math.round(r.ms)),
    r.finance ? String(r.finance.panels) : "",
    r.finance ? r.finance.kw.toFixed(1) : "",
    r.finance ? String(Math.round(r.finance.specificYield)) : "",
    r.finance ? (r.finance.paybackYears === null ? "never" : `${r.finance.paybackYears.toFixed(1)} y`) : "",
    r.finance ? money(r.finance.npv) : "",
    r.finance ? `${Math.round(r.finance.exportShare * 100)}%` : "",
    r.verdict ?? (r.status === 404 ? "NO_COVERAGE" : ""),
    r.flags.length ? "FLAG" : "ok",
  ]);
  const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
  const right = new Set([0, 2, 5, 6, 7, 8, 9, 10, 11, 12]);
  const line = (cells: string[]) => cells.map((s, c) => (right.has(c) ? s.padStart(widths[c]) : s.padEnd(widths[c]))).join("  ").trimEnd();
  const out = [line(head), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)];
  const flagged = results.flatMap((r, i) => r.flags.map((f) => `  #${i + 1} ${r.row.label}: ${f}`));
  if (flagged.length) out.push("", "Flagged:", ...flagged);
  return out.join("\n");
}

/** Access service-token headers from the environment (values never leave this function's return). */
export function accessHeaders(env: Record<string, string | undefined>): Record<string, string> {
  const id = env.CF_ACCESS_CLIENT_ID;
  const secret = env.CF_ACCESS_CLIENT_SECRET;
  return id && secret ? { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret } : {};
}

async function fetchBuilding(base: string, row: DemoRow, headers: Record<string, string>): Promise<Fetched> {
  const url = `${base}/api/solar/building?lat=${row.lat}&lng=${row.lng}`;
  const t0 = performance.now();
  try {
    // redirect: manual, so an Access login redirect shows up as a 302 instead of a 200 HTML page.
    const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    const ms = performance.now() - t0;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { status: res.status, ms, body };
  } catch (e) {
    return { status: 0, ms: performance.now() - t0, body: undefined, error: e instanceof Error ? e.name === "TimeoutError" ? `timeout ${TIMEOUT_MS / 1000} s` : e.message : String(e) };
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--"));
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { list: { type: "string" }, "cache-dir": { type: "string" } },
  });
  const base = (positionals[0] ?? DEFAULT_BASE).replace(/\/+$/, "");
  try {
    new URL(base);
  } catch {
    console.error(`Not a URL: ${base}`);
    return 2;
  }
  const list = (values.list ?? defaultList(base)) as ListName;
  if (list !== "live" && list !== "fixtures") {
    console.error(`--list must be live or fixtures, got ${values.list}`);
    return 2;
  }

  const headers = accessHeaders(process.env);
  const rows = (demo as unknown as Record<ListName, DemoRow[]>)[list];
  const todo = rows.filter((r) => skipReason(r) !== null);
  const checked = rows.filter((r) => skipReason(r) === null);
  console.log(`demo-check: ${base}, ${list} list (${checked.length} rows), Access token ${Object.keys(headers).length ? "sent" : "not set"}`);
  for (const r of todo) console.log(`  skipped "${r.label}": ${skipReason(r)}`);
  if (checked.length === 0) {
    console.error(`Nothing to check: fill in the ${list} list in fixtures/demo-addresses.json.`);
    return 2;
  }

  const results: RowResult[] = [];
  for (const row of checked) results.push(evaluateRow(row, await fetchBuilding(base, row, headers), list));

  const cacheDir = values["cache-dir"] ?? process.env.SOLAR_CACHE_DIR;
  if (cacheDir && list === "live") {
    let entries: CacheEntryMeta[] | null = null;
    try {
      entries = readCacheEntries(path.resolve(cacheDir));
    } catch (e) {
      console.log(`  disk cache not checked: can't read ${cacheDir}/building (${e instanceof Error ? e.message : e})`);
    }
    if (entries) {
      const maxAge = clampMaxAgeDays(process.env.SOLAR_CACHE_MAX_AGE_DAYS);
      console.log(`  disk cache: ${entries.length} entries in ${cacheDir}/building, max age ${maxAge} days`);
      for (const r of results) {
        const f = cacheFlag(r.row, entries, Date.now(), maxAge);
        if (f) r.flags.push(f);
      }
    }
  }

  console.log("\n" + formatTable(results));
  const flagged = results.filter((r) => r.flags.length).length;
  const tooFew = list === "live" && checked.length < MIN_LIVE_ROWS;
  if (tooFew) console.log(`\nOnly ${checked.length} live rows filled in; the demo needs at least ${MIN_LIVE_ROWS}.`);
  console.log(`\n${flagged ? `FAIL: ${flagged} of ${results.length} rows flagged` : tooFew ? "FAIL" : `PASS: ${results.length} rows`}${todo.length ? `, ${todo.length} skipped` : ""}.`);
  return flagged || tooFew ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(2);
    },
  );
}
