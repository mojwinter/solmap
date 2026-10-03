import "server-only";
import { connection } from "next/server";
import { parseFlags, type Flags } from "./flags";

let memo: { raw: string | undefined; flags: Flags } | undefined;

/**
 * The P1 flags for this request. Call from a server component (page or layout) and pass the
 * result down as a prop. `await connection()` makes the page render at request time, so
 * `SOLMAP_FLAGS` is read from the running container, not baked in by `next build`: editing
 * ~/solmap-ops/.env and restarting the container applies it.
 */
export async function getFlags(): Promise<Flags> {
  await connection();
  const raw = process.env.SOLMAP_FLAGS;
  // Parse once per value, so an unknown name warns once instead of on every request.
  if (!memo || memo.raw !== raw) memo = { raw, flags: parseFlags(raw, { nodeEnv: process.env.NODE_ENV }) };
  return memo.flags;
}
