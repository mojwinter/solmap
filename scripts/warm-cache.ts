/**
 * Fetch roofs into the disk cache through the exact SOLAR_SOURCE=cache code path the app uses, so a
 * warmed roof is byte-for-byte what the app would have saved (docs/INFRA.md → Warming).
 *
 *   pnpm solar:warm -- --lat 49.24 --lng -123.07 --label hero
 *   pnpm solar:warm -- --file fixtures/demo-addresses.json      # warms its `live` list
 *   add --layers to also warm the sun heatmap (dataLayers + its 2 rasters: the expensive SKU)
 *
 * Needs SOLAR_API_KEY (env, .env.local or .env) and an IP the key allows (the VPS, or B's machine).
 * A roof that's already cached and fresh costs nothing. Writes to SOLAR_CACHE_DIR (default
 * fixtures/solar, gitignored): never commit what this writes.
 *
 * Runs with `tsx --conditions=react-server` so lib/solar's `import "server-only"` resolves.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createSolarStore, storeOptionsFromEnv } from "@/lib/solar/cache";
import { createLayersStore } from "@/lib/solar/layers-cache";
import { BC_BOUNDS } from "@/src/config/bc";

interface Roof {
  label: string;
  lat: number;
  lng: number;
}

function usage(msg: string): never {
  console.error(
    `${msg}\n\nUsage:\n  pnpm solar:warm -- --lat <lat> --lng <lng> [--label <name>] [--layers]\n  pnpm solar:warm -- --file fixtures/demo-addresses.json [--layers]`,
  );
  process.exit(2);
}

function parseCli(): { roofs: Roof[]; layers: boolean } {
  const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--")); // pnpm passes the "--" through
  // BC longitudes are negative, and parseArgs reads "-123.1" as a flag: glue it on as --lng=-123.1.
  for (let i = argv.length - 2; i >= 0; i--) {
    if (/^--(lat|lng)$/.test(argv[i]) && /^-\d/.test(argv[i + 1])) argv.splice(i, 2, `${argv[i]}=${argv[i + 1]}`);
  }
  const { values } = parseArgs({
    args: argv,
    options: {
      lat: { type: "string" },
      lng: { type: "string" },
      label: { type: "string" },
      file: { type: "string" },
      layers: { type: "boolean", default: false },
    },
  });
  const layers = values.layers === true;

  if (values.file) {
    const json = JSON.parse(readFileSync(values.file, "utf8"));
    const list: unknown[] = Array.isArray(json) ? json : Array.isArray(json.live) ? json.live : [];
    const roofs = list
      .map((r) => r as Partial<Roof> & { address?: string })
      .filter((r) => typeof r.lat === "number" && typeof r.lng === "number" && !(r.lat === 0 && r.lng === 0))
      .map((r, i) => ({ label: r.label ?? r.address ?? `roof ${i + 1}`, lat: r.lat!, lng: r.lng! }));
    if (roofs.length === 0) usage(`${values.file}: no roofs with real lat/lng (the \`live\` list is still TODO?)`);
    return { roofs, layers };
  }

  const lat = Number(values.lat);
  const lng = Number(values.lng);
  if (values.lat === undefined || values.lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    usage("Give --lat and --lng, or --file.");
  }
  return { roofs: [{ label: values.label ?? `${lat},${lng}`, lat, lng }], layers };
}

const inBC = (r: Roof) =>
  r.lat >= BC_BOUNDS.latMin && r.lat <= BC_BOUNDS.latMax && r.lng >= BC_BOUNDS.lngMin && r.lng <= BC_BOUNDS.lngMax;

const how = (layer: string) => (layer === "google" ? "fetched" : "already cached");

async function main() {
  for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
  const { roofs, layers } = parseCli();
  if (!process.env.SOLAR_API_KEY) usage("SOLAR_API_KEY is not set (env, .env.local or .env).");

  const options = { ...storeOptionsFromEnv(), source: "cache" as const };
  console.log(`warming ${roofs.length} roof(s)${layers ? " + heatmaps" : ""} into ${options.cacheDir} (max age ${options.maxAgeDays} days)`);
  const store = createSolarStore(options);
  const layersStore = createLayersStore({ ...options, buildings: store });
  await store.prune();
  await layersStore.prune();

  let failed = 0;
  for (const roof of roofs) {
    if (!inBC(roof)) {
      console.warn(`skip  ${roof.label}: ${roof.lat},${roof.lng} is outside BC`);
      continue;
    }
    try {
      const r = await store.lookup(roof.lat, roof.lng);
      const what = r.status === 200 ? `${r.building.imageryQuality} ${r.building.name}` : "NO_COVERAGE";
      console.log(`${r.status}   ${roof.label}: ${what} (${how(r.layer)})`);
      if (layers && r.status === 200) {
        const l = await layersStore.lookup(roof.lat, roof.lng);
        const lw = l.status === 200 ? `heatmap ${l.imagery.quality} ${l.imagery.date}` : "no heatmap (NO_COVERAGE)";
        console.log(`${l.status}     layers: ${lw} (${how(l.layer)})`);
      }
    } catch (e) {
      failed++;
      console.error(`502   ${roof.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed) {
    console.error(`${failed} roof(s) failed. Nothing was cached for them.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
