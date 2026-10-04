// Machine codes from lib/finance → words, glyphs and tones for the UI. C writes the reason text;
// this file only picks how each code looks, and words the ScenarioWarning codes.
import type { ReasonChip, ScenarioWarning, Verdict } from '@/src/types/app';
import type { IconName } from '@/components/common/Icon';
import { INSTALL, SELF_GENERATION } from '@/src/config/bc';
import { cents, kwh } from '@/lib/format';

export type Tone = 'good' | 'fair' | 'poor';

/** Colour + glyph + word, never colour alone. Weak and Not recommended share red; the glyph and word tell them apart. */
export const VERDICT: Record<Verdict, { label: string; tone: Tone; glyph: IconName }> = {
  strong: { label: 'Strong', tone: 'good', glyph: 'check' },
  moderate: { label: 'Moderate', tone: 'fair', glyph: 'tilde' },
  weak: { label: 'Weak', tone: 'poor', glyph: 'x' },
  not_recommended: { label: 'Not recommended', tone: 'poor', glyph: 'ban' },
};

export const REASON_ICON: Record<ReasonChip['kind'], IconName> = {
  sun: 'sun',
  orientation: 'roof',
  shading: 'cloud',
  rebate_cap: 'dollar',
  export_share: 'bolt',
  oversized: 'panels',
  roof_small: 'roof',
  imagery: 'layers',
  small_savings: 'dollar',
};

export const WARNING_TEXT: Record<ScenarioWarning, string> = {
  SPECIFIC_YIELD_OUT_OF_RANGE:
    `Expected output is outside the usual BC range (about ${kwh(INSTALL.sanityYieldMin)}–${kwh(INSTALL.sanityYieldMax)} kWh per kW a year), so treat this estimate with extra care.`,
  PRODUCES_MORE_THAN_USE:
    `This size makes more power than your home uses in a year. The extra sells back at only ${cents(SELF_GENERATION.exportRatePerKwh)}/kWh.`,
  CLAMPED_INPUT: 'One of your inputs was outside the range we model, so we adjusted it.',
};
