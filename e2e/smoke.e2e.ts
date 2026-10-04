// Smoke test of the report pages on the production build (SOLAR_SOURCE=fixtures, no keys).
// Catches "main no longer renders" once map, finance and UI changes combine. Keep it few and fast:
// select by role and text, never CSS, and don't assert on the map (no Maps key in CI).
import { expect, test as base } from '@playwright/test';
import demo from '@/fixtures/demo-addresses.json';
import { VERDICT } from '@/components/report/copy';
import { DEFAULT_INPUTS } from '@/src/config/bc';
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

// The page has no usage inputs yet (#19), so it runs on DEFAULT_INPUTS: only demo rows with those
// inputs can be checked here. lib/finance/__tests__/demo-verdicts.test.ts covers every row's verdict.
const roofsWithMoney = demo.fixtures.filter(
  (f) =>
    !['NO_COVERAGE', 'not_recommended'].includes(f.expectedVerdict) &&
    f.ratePlan === DEFAULT_INPUTS.ratePlan &&
    f.annualKwh === DEFAULT_INPUTS.annualConsumptionKwh,
);

for (const roof of roofsWithMoney) {
  test(`${roof.label} shows its expected verdict and the source line`, async ({ page }) => {
    await page.goto(`/report/${roof.lat}/${roof.lng}`);

    const payback = page.getByRole('region', { name: /pays for itself in|payback/i });
    await expect(payback).toBeVisible();
    await expect(payback).toContainText(VERDICT[roof.expectedVerdict as Verdict].label);
    await expect(page.getByText(SYNTHETIC_SOURCE)).toBeVisible();
  });
}

test('moving the size slider re-runs the numbers, and "Use it" goes back', async ({ page }) => {
  const hero = fixture(49.25, -123.15);
  await page.goto(`/report/${hero.lat}/${hero.lng}`);

  const payback = page.getByRole('region', { name: /pays for itself in|payback/i });
  const slider = page.getByRole('slider', { name: 'System size' });
  await expect(page.getByText('Recommended size')).toBeVisible();
  const recommendedSize = await slider.getAttribute('aria-valuetext');
  const recommendedPayback = await payback.textContent();

  // Step whichever way is open, so this survives the recommendation moving to either end.
  const more = page.getByRole('button', { name: 'More panels' });
  await (await more.isEnabled() ? more : page.getByRole('button', { name: 'Fewer panels' })).click();
  await expect(slider).not.toHaveAttribute('aria-valuetext', recommendedSize!);
  await expect(page.getByText(`We recommend ${recommendedSize}`)).toBeVisible();
  await expect(payback).not.toHaveText(recommendedPayback!);

  await page.getByRole('button', { name: 'Use it' }).click();
  await expect(slider).toHaveAttribute('aria-valuetext', recommendedSize!);
  await expect(payback).toHaveText(recommendedPayback!);
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
