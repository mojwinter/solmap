// P1 feature flags (docs/INFRA.md → Feature flags). Pure and client-safe: the browser may
// import the types and `FLAGS`, but only the server reads the env, via lib/flags.server.ts.

/** Every P1 feature that can be switched off on prod. Add a name here before shipping a P1 PR. */
export const FLAGS = [
  "heatmap", // sun heatmap overlay on the map (dataLayers)
  "charts", // payback / size-sweep charts
  "assumptions", // assumptions drawer
  "manual", // manual estimate when Google has no roof
  "battery", // battery scenario
  "print", // print CSS / print button
] as const;

export type Flag = (typeof FLAGS)[number];

/** Resolved on the server, passed down to client components as a prop. */
export type Flags = Readonly<Record<Flag, boolean>>;

const isFlag = (name: string): name is Flag => (FLAGS as readonly string[]).includes(name);

function allFlags(on: boolean): Flags {
  return Object.fromEntries(FLAGS.map((f) => [f, on])) as Record<Flag, boolean>;
}

export interface ParseFlagsOptions {
  /** Decides the default when `raw` is unset. Pass `process.env.NODE_ENV`. */
  nodeEnv?: string;
  warn?: (message: string) => void;
}

/**
 * `SOLMAP_FLAGS` → which P1 features are on.
 *
 * - Unset: every flag **off** in production, every flag **on** otherwise (`pnpm dev`, tests),
 *   so a feature only reaches prod when someone lists it on purpose.
 * - Set (even to an empty string): exactly the listed names are on. Comma- or space-separated,
 *   case-insensitive. `all` turns everything on; `none` (or empty) turns everything off.
 * - Unknown names are ignored with a warning, so a typo can't take the page down.
 */
export function parseFlags(raw: string | undefined, opts: ParseFlagsOptions = {}): Flags {
  if (raw === undefined) return allFlags(opts.nodeEnv !== "production");

  const names = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (names.includes("all")) return allFlags(true);

  const flags = allFlags(false) as Record<Flag, boolean>;
  const unknown: string[] = [];
  for (const name of names) {
    if (isFlag(name)) flags[name] = true;
    else if (name !== "none") unknown.push(name);
  }
  if (unknown.length > 0) {
    (opts.warn ?? console.warn)(
      `SOLMAP_FLAGS: ignoring unknown flag(s) ${unknown.join(", ")} (known: ${FLAGS.join(", ")})`,
    );
  }
  return flags;
}
