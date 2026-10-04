import { DEFAULT_INPUTS } from '@/src/config/bc';
import type { RatePlan } from '@/src/types/app';

/**
 * The report's shareable state beyond lat/lng (DESIGN.md §2): `?panels=&kwh=&plan=`. Annual kWh, never
 * the bill amount: same number for the model, and it reveals less about the household. Pure, so the
 * server page and the client view parse and write it the same way.
 */
export interface ReportQuery {
  address?: string;
  /** Panel count of the size on screen; only written when it isn't the recommended size. */
  panels?: number;
  /** Annual household kWh; only written when it isn't the typical BC home. */
  kwh?: number;
  /** Only written when it isn't the default plan. */
  plan?: RatePlan;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** A positive whole number, or undefined. The finance engine clamps out-of-range kWh and says so. */
function positiveInt(raw: string | undefined, max: number): number | undefined {
  if (!raw || !/^\d+(\.\d+)?$/.test(raw.trim())) return undefined;
  const n = Math.round(Number(raw));
  return n > 0 && n <= max ? n : undefined;
}

/** Junk is dropped, never an error: a hand-edited link still opens a report. */
export function parseReportQuery(params: RawParams): ReportQuery {
  const address = first(params.address)?.trim().slice(0, 120) || undefined;
  const plan = first(params.plan);
  return {
    address,
    panels: positiveInt(first(params.panels), 10_000),
    kwh: positiveInt(first(params.kwh), 1_000_000),
    plan: plan === 'tiered' || plan === 'flat' ? plan : undefined,
  };
}

/** "?address=…&panels=12&kwh=16000&plan=flat", or "" when everything is a default. */
export function reportSearch({ address, panels, kwh, plan }: ReportQuery): string {
  const q = new URLSearchParams();
  if (address) q.set('address', address);
  if (panels !== undefined) q.set('panels', String(panels));
  if (kwh !== undefined && Math.round(kwh) !== DEFAULT_INPUTS.annualConsumptionKwh) q.set('kwh', String(Math.round(kwh)));
  if (plan && plan !== DEFAULT_INPUTS.ratePlan) q.set('plan', plan);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Index of the config with exactly `panels` panels, else the largest one below it, else the smallest. */
export function configIndexFor(configs: readonly { panelsCount: number }[], panels: number): number | null {
  if (configs.length === 0) return null;
  let best = 0;
  for (let i = 0; i < configs.length; i++) if (configs[i].panelsCount <= panels) best = i;
  return best;
}
