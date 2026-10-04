import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '@/src/config/bc';
import { configIndexFor, parseReportQuery, reportSearch } from './urlState';

describe('parseReportQuery', () => {
  it('reads panels, kwh and plan', () => {
    expect(parseReportQuery({ panels: '12', kwh: '16000', plan: 'flat', address: ' 1 Main St ' })).toEqual({
      address: '1 Main St',
      panels: 12,
      kwh: 16000,
      plan: 'flat',
    });
  });

  it('drops junk instead of failing', () => {
    expect(parseReportQuery({ panels: 'lots', kwh: '-5', plan: 'cheap', address: '  ' })).toEqual({
      address: undefined,
      panels: undefined,
      kwh: undefined,
      plan: undefined,
    });
    expect(parseReportQuery({ panels: '0', kwh: '1e9' })).toMatchObject({ panels: undefined, kwh: undefined });
  });

  it('takes the first of repeated params and rounds decimals', () => {
    expect(parseReportQuery({ panels: ['8', '9'], kwh: '12000.6' })).toMatchObject({ panels: 8, kwh: 12001 });
  });
});

describe('reportSearch', () => {
  it('is empty when everything is a default', () => {
    expect(reportSearch({ kwh: DEFAULT_INPUTS.annualConsumptionKwh, plan: DEFAULT_INPUTS.ratePlan })).toBe('');
  });

  it('writes only what differs, and round-trips', () => {
    const s = reportSearch({ address: 'Roedde House, Vancouver', panels: 14, kwh: 16000.4, plan: 'flat' });
    expect(s).toBe('?address=Roedde+House%2C+Vancouver&panels=14&kwh=16000&plan=flat');
    const back = parseReportQuery(Object.fromEntries(new URLSearchParams(s)));
    expect(back).toEqual({ address: 'Roedde House, Vancouver', panels: 14, kwh: 16000, plan: 'flat' });
  });
});

describe('configIndexFor', () => {
  const configs = [{ panelsCount: 4 }, { panelsCount: 5 }, { panelsCount: 8 }, { panelsCount: 12 }];

  it('finds the exact count', () => expect(configIndexFor(configs, 8)).toBe(2));
  it('falls back to the largest size below it', () => expect(configIndexFor(configs, 10)).toBe(2));
  it('caps at the biggest config', () => expect(configIndexFor(configs, 99)).toBe(3));
  it('uses the smallest when asked for fewer', () => expect(configIndexFor(configs, 1)).toBe(0));
  it('is null with no configs', () => expect(configIndexFor([], 8)).toBeNull());
});
