import { describe, expect, it } from 'vitest';
import { looksOutsideBc } from './OutsideBcBanner';

// Must agree with the server's outsideBC (lib/solar/cache.ts), or a BC roof would get the banner.
describe('looksOutsideBc', () => {
  it('treats BC, however Google spells it, as inside', () => {
    expect(looksOutsideBc('BC')).toBe(false);
    expect(looksOutsideBc(' bc ')).toBe(false);
    expect(looksOutsideBc('British Columbia')).toBe(false);
  });

  it('says nothing when the area is missing', () => {
    expect(looksOutsideBc(undefined)).toBe(false);
    expect(looksOutsideBc('')).toBe(false);
  });

  it('flags another province or state', () => {
    expect(looksOutsideBc('AB')).toBe(true);
    expect(looksOutsideBc('WA')).toBe(true);
  });
});
