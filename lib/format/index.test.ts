import { describe, expect, it } from 'vitest';
import { breakEvenYear, cad, cents, compass, imageryLabel, isLowConfidence, kw, kwh, MINUS, monthYear, signedCad, sizeLabel, years } from '.';

describe('money', () => {
  it('rounds to whole dollars with thousands separators', () => {
    expect(cad(12000)).toBe('$12,000');
    expect(cad(7199.6)).toBe('$7,200');
    expect(cad(-4200.4)).toBe(`${MINUS}$4,200`);
  });

  it('signs net figures with a true minus', () => {
    expect(signedCad(10131.1)).toBe('+$10,131');
    expect(signedCad(-4200)).toBe('−$4,200');
    expect(signedCad(0.4)).toBe('$0');
  });

  it('names the break-even year by rounding payback', () => {
    expect(breakEvenYear(2026, 11.7)).toBe(2038);
    expect(breakEvenYear(2026, 11.2)).toBe(2037);
    expect(breakEvenYear(2026, 0.4)).toBe(2026);
  });

  it('formats a per-kWh rate in cents', () => {
    expect(cents(0.1)).toBe('10¢');
    expect(cents(0.1348)).toBe('13.5¢');
  });
});

describe('energy and size', () => {
  it('formats kWh, kW and years', () => {
    expect(kwh(4762.6)).toBe('4,763');
    expect(kw(4.8)).toBe('4.8');
    expect(kw(2)).toBe('2.0');
    expect(years(11.7046)).toBe('11.7');
  });

  it('labels the slider', () => {
    expect(sizeLabel(4.8, 12, 4782.4)).toBe('4.8 kW DC · 12 panels · 4,782 kWh');
    expect(sizeLabel(0.4, 1, 401.5)).toBe('0.4 kW DC · 1 panel · 402 kWh');
  });
});

describe('compass', () => {
  it.each([
    [0, 'north'],
    [90, 'east'],
    [180, 'south'],
    [200, 'south'],
    [225, 'south-west'],
    [337.6, 'north'],
    [-90, 'west'],
  ])('%s° → %s', (deg, word) => expect(compass(deg)).toBe(word));
});

describe('imagery', () => {
  it('labels quality with month and year', () => {
    expect(imageryLabel('HIGH', '2024-08-15')).toBe('High-res aerial · Aug 2024');
    expect(monthYear('2023-01-01')).toBe('Jan 2023');
    expect(monthYear('nonsense')).toBe('nonsense');
  });

  it('flags BASE and LOW as lower confidence', () => {
    expect(isLowConfidence('BASE')).toBe(true);
    expect(isLowConfidence('LOW')).toBe(true);
    expect(isLowConfidence('MEDIUM')).toBe(false);
  });
});
