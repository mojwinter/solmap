// Smoke test of the report pages on the production build (SOLAR_SOURCE=fixtures, no keys).
// Catches "main no longer renders" once map, finance and UI changes combine. Keep it few and fast:
// select by role and text, never CSS, and don't assert on the map (no Maps key in CI).
import { expect, test as base } from '@playwright/test';
import demo from '@/fixtures/demo-addresses.json';
import { VERDICT } from '@/components/report/copy';
import type { Verdict } from '@/src/types/app';

/** Every test fails if its page throws an uncaught error. */
const test = base.extend({
  page: async ({ page }, provide) => {
    const errors: Error[] = [];
    page.on('pageerror', (e) => errors.push(e));
    await provide(page);
    expect(errors.map(String), 'uncaught page errors').toEqual([]);
  },
});

function fixture(lat: number, lng: number) {
  const f = demo.fixtures.find((x) => x.lat === lat && x.lng === lng);
  if (!f) throw new Error(`no demo fixture at ${lat},${lng}`);
  return f;
}

// Shown under synthetic roofs instead of Google's attribution (components/report/Attribution.tsx);
// real roofs (live/cache) show ATTRIBUTION from src/config/bc.ts.
const SYNTHETIC_SOURCE = 'Sample roof: synthetic test data, not Google imagery.';

test('home page loads', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await page.waitForLoadState('load');
});

test('hero roof shows its expected verdict and the source line', async ({ page }) => {
  const hero = fixture(49.25, -123.15);
  await page.goto(`/report/${hero.lat}/${hero.lng}`);

  const payback = page.getByRole('region', { name: /pays for itself in|payback/i });
  await expect(payback).toBeVisible();
  await expect(payback).toContainText(VERDICT[hero.expectedVerdict as Verdict].label);
  await expect(page.getByText(SYNTHETIC_SOURCE)).toBeVisible();
});

test('a point with no roof data shows the no-coverage state', async ({ page }) => {
  const none = fixture(53.9171, -122.7497);
  expect(none.expectedVerdict).toBe('NO_COVERAGE');
  await page.goto(`/report/${none.lat}/${none.lng}`);

  await expect(page.getByRole('heading', { name: /can.t see this roof yet/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'A sunny south-facing roof' })).toBeVisible();
});

test('a roof too small for panels says not recommended', async ({ page }) => {
  const tiny = fixture(49.888, -119.496);
  await page.goto(`/report/${tiny.lat}/${tiny.lng}`);

  const verdict = page.getByRole('region', { name: 'Is solar worth it here?' });
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText(VERDICT[tiny.expectedVerdict as Verdict].label);
});

test('health check answers ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
