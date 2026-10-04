// Pure display formatters for the report. Money is whole CAD; energy kWh; power kW (CLAUDE.md rule 8).
import type { ImageryQuality } from '@/src/types/solar';

/** True minus sign (U+2212), per the design's voice rules. */
export const MINUS = '−';

const whole = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 });

/** 12000 → "$12,000"; −4200 → "−$4,200". */
export function cad(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? MINUS : ''}$${whole.format(Math.abs(r))}`;
}

/** Net figures carry a sign: 10131 → "+$10,131", −4200 → "−$4,200", 0 → "$0". */
export function signedCad(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '$0';
  return `${r > 0 ? '+' : MINUS}$${whole.format(Math.abs(r))}`;
}

/**
 * The calendar year the system pays for itself: 2026 + 11.7 years → 2038. One rule for every place
 * that names the year (PaybackHero, the cash-flow chart), so they can't disagree.
 */
export function breakEvenYear(startYear: number, paybackYears: number): number {
  return startYear + Math.round(paybackYears);
}

/** 4762.6 → "4,763" (pair with a small "kWh" unit). */
export function kwh(n: number): string {
  return whole.format(Math.round(n));
}

/** 4.8 → "4.8" (pair with a small "kW" unit). */
export function kw(n: number): string {
  return n.toFixed(1);
}

/** 0.135 $/kWh → "13.5¢". */
export function cents(dollarsPerKwh: number): string {
  const c = Math.round(dollarsPerKwh * 1000) / 10;
  return `${Number.isInteger(c) ? c.toFixed(0) : c.toFixed(1)}¢`;
}

/** 11.70 → "11.7". */
export function years(n: number): string {
  return n.toFixed(1);
}

/** "4.8 kW DC · 12 panels · 4,782 kWh" (the size slider's label). */
export function sizeLabel(kwDc: number, panels: number, acKwhYear1: number): string {
  return `${kw(kwDc)} kW DC · ${panels} ${panels === 1 ? 'panel' : 'panels'} · ${kwh(acKwhYear1)} kWh`;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;

/** Azimuth degrees (0 = north, 90 = east) → "south-west". */
export function compass(azimuthDegrees: number): string {
  const i = Math.round((((azimuthDegrees % 360) + 360) % 360) / 45) % 8;
  return COMPASS[i];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-08-15" → "Aug 2024". Parsed by hand so the time zone can't shift the month. */
export function monthYear(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return isoDate;
  return `${MONTHS[m - 1]} ${y}`;
}

const QUALITY: Record<ImageryQuality, string> = {
  HIGH: 'High-res aerial',
  MEDIUM: 'Aerial',
  BASE: 'Satellite-based, lower confidence',
  LOW: 'Low-res, lower confidence',
};

/** True for BASE / LOW imagery (DESIGN.md §3 → States: "lower confidence" badge). */
export function isLowConfidence(quality: ImageryQuality): boolean {
  return quality === 'BASE' || quality === 'LOW';
}

/** Confidence badge text: "High-res aerial · Aug 2024". */
export function imageryLabel(quality: ImageryQuality, isoDate: string): string {
  return `${QUALITY[quality]} · ${monthYear(isoDate)}`;
}
