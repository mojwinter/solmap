import "server-only";
/**
 * Disk helpers shared by the building and layers caches. Every path built here carries
 * turbopackIgnore: the cache dir is only known at runtime, and without the hint Turbopack's tracer
 * globs whatever it can guess and copies matching files (cached Google responses included) into
 * .next/standalone.
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const inDir = (dir: string, file: string) => path.join(/*turbopackIgnore: true*/ dir, file);

export const errText = (e: unknown) => JSON.stringify(e instanceof Error ? e.message : String(e));

/** Lists a directory; a missing one is just empty. */
export async function listDir(dir: string, log: (line: string) => void): Promise<string[]> {
  try {
    return await fs.readdir(/*turbopackIgnore: true*/ dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") log(`solar cache readdir failed dir=${dir} err=${errText(e)}`);
    return [];
  }
}

/** Temp file + rename, so a reader (the server, or `pnpm solar:warm` writing alongside it) never sees half a file. */
export async function writeFileAtomic(dir: string, file: string, data: string | Uint8Array): Promise<void> {
  const tmp = inDir(dir, `.${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, inDir(dir, file));
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

/** Temp files left by a crashed write. Old enough that no write can still be in progress. */
export const STALE_TMP_MS = 3_600_000;

/** Like Promise.all(items.map(fn)) but at most `limit` at a time (a cold index of thousands of files hit EMFILE). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const INDEX_CONCURRENCY = 16;

/** A directory's mtime (changes when a file is added, renamed or removed), or -1 if it doesn't exist. */
export async function dirMtime(dir: string): Promise<number> {
  try {
    return (await fs.stat(/*turbopackIgnore: true*/ dir)).mtimeMs;
  } catch {
    return -1;
  }
}

/* ───────────── disk cap (security review M1) ───────────── */

/**
 * Caps the whole cache dir (building/, layers/, geotiff/) by file count and bytes. The volume is shared
 * with other apps on the box, and every distinct Google call writes a file. Past the cap, writes are
 * refused (and logged) but the answer is still served; the hourly prune frees space as entries expire.
 */
export interface DiskQuota {
  /** Reserves room for `files` new files totalling `bytes`; false = don't write. */
  allow(bytes: number, files?: number): Promise<boolean>;
}

export const DEFAULT_CACHE_MAX_FILES = 5_000;
export const DEFAULT_CACHE_MAX_MB = 2_048;
const QUOTA_RESCAN_MS = 60_000;

export function createDiskQuota(opts: {
  cacheDir: string;
  maxFiles: number;
  maxBytes: number;
  now?: () => number;
  log?: (line: string) => void;
}): DiskQuota {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((l: string) => console.log(l));
  let files = 0;
  let bytes = 0;
  let scannedAt = -Infinity;
  let warnedAt = -Infinity;

  async function scan() {
    let f = 0;
    let b = 0;
    for (const sub of ["building", "layers", "geotiff"]) {
      const dir = inDir(opts.cacheDir, sub);
      const names = await listDir(dir, log);
      const sizes = await mapLimit(names, INDEX_CONCURRENCY, async (n) => {
        try {
          return (await fs.stat(inDir(dir, n))).size;
        } catch {
          return 0;
        }
      });
      f += names.length;
      b += sizes.reduce((x, y) => x + y, 0);
    }
    [files, bytes, scannedAt] = [f, b, now()];
  }

  return {
    async allow(n, count = 1) {
      if (now() - scannedAt > QUOTA_RESCAN_MS) await scan();
      if (files + count > opts.maxFiles || bytes + n > opts.maxBytes) {
        if (now() - warnedAt > QUOTA_RESCAN_MS) {
          log(`solar cache FULL files=${files}/${opts.maxFiles} bytes=${bytes}/${opts.maxBytes}: not saving`);
          warnedAt = now();
        }
        return false;
      }
      files += count;
      bytes += n;
      return true;
    },
  };
}

/** SOLAR_CACHE_MAX_FILES / SOLAR_CACHE_MAX_MB; unset or invalid → 5,000 files / 2 GB. */
export function diskQuotaFromEnv(cacheDir: string, env: Record<string, string | undefined> = process.env): DiskQuota {
  const read = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : d;
  };
  return createDiskQuota({
    cacheDir,
    maxFiles: read(env.SOLAR_CACHE_MAX_FILES, DEFAULT_CACHE_MAX_FILES),
    maxBytes: read(env.SOLAR_CACHE_MAX_MB, DEFAULT_CACHE_MAX_MB) * 1024 * 1024,
  });
}

const globalForQuota = globalThis as typeof globalThis & { __solarDiskQuota?: DiskQuota };

/** One quota for the app's cache dir, shared by the building and layers stores. */
export function getDiskQuota(cacheDir: string): DiskQuota {
  globalForQuota.__solarDiskQuota ??= diskQuotaFromEnv(cacheDir);
  return globalForQuota.__solarDiskQuota;
}
