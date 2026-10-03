import "server-only";
/**
 * A process-wide cap on billable Google calls per SKU per UTC day (security review C1). The per-IP
 * rate limit stops one client; this stops everyone together, e.g. a crawler walking distinct roofs.
 * Counted just before each real Google call (the log's layer=google), in memory, reset at UTC midnight.
 * Past the cap, lookups fail with DailyBudgetError and the routes answer 503.
 */
import { UpstreamError } from "./client";

export type Sku = "building" | "layers";

export const DEFAULT_DAILY_MAX: Record<Sku, number> = { building: 300, layers: 50 };

export class DailyBudgetError extends UpstreamError {
  constructor(
    readonly sku: Sku,
    readonly limit: number,
  ) {
    super(`daily limit reached (${sku}: ${limit} Google calls per UTC day)`, 503);
    this.name = "DailyBudgetError";
  }
}

export interface DailyBudget {
  /** Counts one call, or throws DailyBudgetError if today's cap is used up. */
  take(sku: Sku): void;
  used(sku: Sku): number;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function createDailyBudget(
  limits: Record<Sku, number>,
  now: () => number = Date.now,
  log: (line: string) => void = (l) => console.log(l),
): DailyBudget {
  let day = utcDay(now());
  let used: Record<Sku, number> = { building: 0, layers: 0 };
  let warned: Record<Sku, boolean> = { building: false, layers: false };
  const roll = () => {
    const d = utcDay(now());
    if (d !== day) {
      day = d;
      used = { building: 0, layers: 0 };
      warned = { building: false, layers: false };
    }
  };
  return {
    take(sku) {
      roll();
      if (used[sku] >= limits[sku]) {
        if (!warned[sku]) log(`solar budget EXHAUSTED sku=${sku} limit=${limits[sku]} day=${day}`);
        warned[sku] = true;
        throw new DailyBudgetError(sku, limits[sku]);
      }
      used[sku]++;
    },
    used(sku) {
      roll();
      return used[sku];
    },
  };
}

/** SOLAR_DAILY_MAX_BUILDING / SOLAR_DAILY_MAX_LAYERS; unset or invalid → the defaults. 0 = no calls. */
export function dailyLimitsFromEnv(env: Record<string, string | undefined> = process.env): Record<Sku, number> {
  const read = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : d;
  };
  return {
    building: read(env.SOLAR_DAILY_MAX_BUILDING, DEFAULT_DAILY_MAX.building),
    layers: read(env.SOLAR_DAILY_MAX_LAYERS, DEFAULT_DAILY_MAX.layers),
  };
}

const globalForBudget = globalThis as typeof globalThis & { __solarDailyBudget?: DailyBudget };

/** Shared by the building and layers stores, so the caps are per process, not per store. */
export function getDailyBudget(): DailyBudget {
  globalForBudget.__solarDailyBudget ??= createDailyBudget(dailyLimitsFromEnv());
  return globalForBudget.__solarDailyBudget;
}
