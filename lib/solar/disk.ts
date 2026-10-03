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

/** Temp file + rename, so a reader (or the other env sharing the folder) never sees half a file. */
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
