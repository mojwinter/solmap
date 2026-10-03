import { REBATES, TUNING } from '@/src/config/bc';
import type { BuildingResponse, ReasonChip, ScenarioResult, Verdict } from '@/src/types/app';

const fmt = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 });
const dollars = (n: number) => `$${fmt.format(Math.round(n))}`;
/** "~$X" copy rounds to the nearest $100; exact amounts stay in the MoneyCard. */
const approxDollars = (n: number) => `$${fmt.format(Math.round(n / 100) * 100)}`;
const kw = (n: number) => `${n.toFixed(1)} kW`;

/** First match wins (DESIGN.md §5). */
export function verdictFor(s: ScenarioResult): Verdict {
  const { strong, moderate } = TUNING.verdict;
  const p = s.paybackYears;
  if (p === null) return 'not_recommended';
  if (p <= strong.maxPaybackYears && s.npv >= strong.minNpv) return 'strong';
  if (p <= moderate.maxPaybackYears && s.npv >= moderate.minNpv) return 'moderate';
  return 'weak';
}

/** Missed Moderate only because of the NPV floor (the materiality rule). */
function missedOnNpvFloor(s: ScenarioResult, verdict: Verdict): boolean {
  const { moderate } = TUNING.verdict;
  return verdict === 'weak' && s.paybackYears !== null && s.paybackYears <= moderate.maxPaybackYears && s.npv < moderate.minNpv;
}

const COMPASS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];
const compassWord = (az: number) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];
const facesNorth = (az: number) => {
  const a = ((az % 360) + 360) % 360;
  return a >= 315 || a <= 45;
};

function imageryAgeYears(date: string, now: Date): number | null {
  const t = Date.parse(date);
  return Number.isNaN(t) ? null : (now.getTime() - t) / (365.25 * 24 * 3600 * 1000);
}

/** The segment holding the most panels in the recommended config, if the building has segment data. */
function dominantSegment(building: BuildingResponse, index: number) {
  const used = building.configs[index]?.segments ?? [];
  if (used.length === 0) return undefined;
  const top = used.reduce((a, b) => (b.panelsCount > a.panelsCount ? b : a));
  return building.segments.find((s) => s.index === top.segmentIndex);
}

/**
 * Top-3 reason chips: the chip that explains the verdict first, then warnings, then neutral, then positives.
 * `now` only drives the imagery-age check; tests pin it with fake timers.
 */
export function reasonChips(
  building: BuildingResponse,
  index: number | null,
  scenarios: ScenarioResult[],
  verdict: Verdict,
  now: Date = new Date(),
): ReasonChip[] {
  if (index === null) return [{ kind: 'roof_small', tone: 'warn', text: 'Not enough usable roof for panels' }];

  const s = scenarios[index];
  const chips: ReasonChip[] = [];

  const smallSavings = missedOnNpvFloor(s, verdict);
  if (smallSavings) {
    chips.push({
      kind: 'small_savings',
      tone: 'warn',
      text: `Pays back, but saves only ~${approxDollars(s.lifetimeNetSavings)} over ${s.years.length} years`,
    });
  }

  const seg = dominantSegment(building, index);
  if (seg && seg.sunshineQuantiles.length >= 6) {
    const q1 = seg.sunshineQuantiles[1];
    const q5 = seg.sunshineQuantiles[5];
    if (q5 > 0 && (q5 - q1) / q5 > TUNING.shadingSpread) {
      chips.push({ kind: 'shading', tone: 'warn', text: 'Partial shading on the main roof' });
    }
  }

  if (s.offsetPct > 1) chips.push({ kind: 'oversized', tone: 'warn', text: 'Produces more than you use' });

  const produced = s.year1.selfUsedKwh + s.year1.exportedKwh;
  const exportShare = produced > 0 ? s.year1.exportedKwh / produced : 0;
  if (exportShare > TUNING.exportShareWarn) {
    chips.push({
      kind: 'export_share',
      tone: 'warn',
      text: `${Math.round(exportShare * 100)}% of this size would sell at 10¢; smaller pays back faster`,
    });
  }

  const sunHours = building.roof.maxSunshineHoursPerYear;
  if (sunHours > 0) {
    const good = sunHours >= TUNING.bcReferenceSunHours;
    chips.push({
      kind: 'sun',
      tone: good ? 'good' : 'warn',
      text: `${fmt.format(Math.round(sunHours))} sun-hours a year, ${good ? 'above' : 'below'} the BC typical`,
    });
  }

  if (seg) {
    const north = facesNorth(seg.azimuthDegrees);
    chips.push({
      kind: 'orientation',
      tone: north ? 'warn' : 'good',
      text: `${compassWord(seg.azimuthDegrees)} roof, ${Math.round(seg.pitchDegrees)}° pitch`,
    });
  }

  const capKw = REBATES.solar.maxResidential / REBATES.solar.perKwDc;
  const maxKw = Math.max(...scenarios.map((x) => x.systemKwDc));
  if (s.rebate > 0 && (s.systemKwDc >= capKw || maxKw > capKw)) {
    chips.push({ kind: 'rebate_cap', tone: 'neutral', text: `BC Hydro's rebate stops growing at ${capKw} kW` });
  }

  const age = imageryAgeYears(building.imagery.date, now);
  const lowQuality = building.imagery.quality === 'BASE' || building.imagery.quality === 'LOW';
  if (lowQuality) {
    chips.push({ kind: 'imagery', tone: 'neutral', text: 'Satellite imagery, lower confidence' });
  } else if (age !== null && age > TUNING.imageryMaxAgeYears) {
    chips.push({ kind: 'imagery', tone: 'neutral', text: `Roof imagery is ${Math.floor(age)} years old, lower confidence` });
  }

  // Ordering: explainer, then warn → neutral → good (insertion order within a tone is the priority).
  const toneRank = { warn: 0, neutral: 1, good: 2 } as const;
  const sorted = [...chips].sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);
  const explainer = smallSavings
    ? sorted.find((c) => c.kind === 'small_savings')
    : verdict === 'strong' || verdict === 'moderate'
      ? sorted.find((c) => c.tone === 'good')
      : sorted.find((c) => c.tone === 'warn');
  const ordered = explainer ? [explainer, ...sorted.filter((c) => c !== explainer)] : sorted;
  return ordered.slice(0, 3);
}

export function headline(index: number | null, scenarios: ScenarioResult[]): string {
  if (index === null) return 'There isn’t enough usable roof here for solar panels.';
  const s = scenarios[index];
  const life = s.years.length;
  if (s.paybackYears === null) {
    return `Solar doesn’t pay for itself here within ${life} years: a ${kw(s.systemKwDc)} system would leave you ${dollars(-s.lifetimeNetSavings)} behind.`;
  }
  return `A ${kw(s.systemKwDc)} system pays for itself in about ${Math.round(s.paybackYears)} years and saves ~${approxDollars(s.lifetimeNetSavings)} over ${life}.`;
}
