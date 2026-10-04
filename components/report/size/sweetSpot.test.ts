import { describe, expect, it } from 'vitest';
import { neverPaysFrom, peakIndex, sweetSpotSummary, type SweetSpotPoint } from './sweetSpot';

const pt = (index: number, npv: number, payback: number | null): SweetSpotPoint => ({
  index,
  kw: 1.6 + index * 0.4,
  panels: 4 + index,
  npv,
  payback,
});

// Rises to a peak at index 2, then falls; the last two never pay back.
const curve = [pt(0, 1200, 13), pt(1, 2400, 12), pt(2, 3100, 12.4), pt(3, 900, 19), pt(4, -800, null), pt(5, -2500, null)];

describe('sweet spot', () => {
  it('finds the NPV peak (first on a tie)', () => {
    expect(peakIndex(curve)).toBe(2);
    expect(peakIndex([pt(0, 5, 10), pt(1, 5, 10)])).toBe(0);
    expect(peakIndex([])).toBeNull();
  });

  it('finds where it stops paying back for good', () => {
    expect(neverPaysFrom(curve)?.index).toBe(4);
    expect(neverPaysFrom([pt(0, 1, null), pt(1, 2, 20)])).toBeNull();
  });

  it('says where value peaks, why bigger earns less, and where it never pays back', () => {
    expect(sweetSpotSummary(curve, 0.1, 25)).toBe(
      'Value tops out around 2.4 kW. Bigger systems sell more of their power back at 10¢, so each extra panel earns less. From 3.2 kW up it never pays back within 25 years.',
    );
  });

  it('skips "bigger earns less" when the biggest size is the peak', () => {
    expect(sweetSpotSummary([pt(0, 100, 20), pt(1, 900, 15)], 0.1, 25)).toBe('Value tops out around 2.0 kW.');
  });

  it('names the recommended size when there is one', () => {
    expect(sweetSpotSummary(curve, 0.1, 25, 1)).toMatch(/^Value tops out around 2\.0 kW\./);
  });

  it('says plainly when no size comes out ahead', () => {
    expect(sweetSpotSummary([pt(0, -100, null), pt(1, -900, null)], 0.1, 25)).toBe(
      "No size comes out ahead in today's dollars over 25 years.",
    );
  });
});
