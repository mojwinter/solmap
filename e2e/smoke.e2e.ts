// Smoke test of the report pages on the production build (SOLAR_SOURCE=fixtures, no keys).
// Catches "main no longer renders" once map, finance and UI changes combine. Keep it few and fast:
// select by role and text, never CSS, and don't assert on the map (no Maps key in CI).
import { expect, test as base, type Page } from '@playwright/test';
import demo from '@/fixtures/demo-addresses.json';
import { VERDICT } from '@/components/report/copy';
import { DAILY_LIMIT_MESSAGE, DEFAULT_ERROR_MESSAGES } from '@/lib/solar/get-building';
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

test('a shared link restores size, usage and plan, and the URL follows the controls (#20)', async ({ page }) => {
  await page.goto('/report/49.25/-123.15?panels=30&kwh=16000&plan=flat');

  const slider = page.getByRole('slider', { name: 'System size' });
  await expect(slider).toHaveAttribute('aria-valuetext', /^30 panels/);
  // Usage and rate plan live in their own tab of the report panel.
  await page.getByRole('tab', { name: 'Your usage' }).click();
  await expect(page.getByLabel('Electricity used in a year')).toHaveValue('16000');
  await expect(page.getByRole('group', { name: 'Rate plan' }).getByRole('button', { name: 'Flat' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'More panels' }).click();
  await expect(page).toHaveURL(/[?&]panels=31(&|$)/);
  await expect(page).toHaveURL(/[?&]kwh=16000(&|$)/);
  await expect(page).toHaveURL(/[?&]plan=flat(&|$)/);

  // Back on the recommended size, the link stops pinning a size.
  await page.getByRole('button', { name: 'Use it' }).click();
  await expect(page).not.toHaveURL(/panels=/);
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

/** ApiErrorState (Next's route announcer is also an alert). */
const errorState = (page: Page) =>
  page.getByRole('alert').filter({ has: page.getByRole('heading', { name: /couldn.t load this roof/i }) });

test('a point outside BC says the tool covers BC only', async ({ page }) => {
  await page.goto('/report/45/-75');
  await expect(page.getByRole('heading', { name: 'This tool covers BC only' })).toBeVisible();
});

test('rate limited (429): the error state retries into the report', async ({ page }) => {
  // The roof is fetched in the browser, so the first lookup can be answered with a 429 here.
  let calls = 0;
  await page.route('**/api/solar/building?*', (route) =>
    ++calls === 1
      ? route.fulfill({ status: 429, json: { error: 'RATE_LIMITED' }, headers: { 'Retry-After': '1' } })
      : route.continue(),
  );
  await page.goto('/report/49.25/-123.15');

  const alert = errorState(page);
  await expect(alert).toContainText(DEFAULT_ERROR_MESSAGES.RATE_LIMITED);
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('region', { name: /pays for itself in|payback/i })).toBeVisible();
});

test("daily Google budget spent (503) gets its own copy", async ({ page }) => {
  await page.route('**/api/solar/building?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'UPSTREAM', message: 'daily limit reached' } }),
  );
  await page.goto('/report/49.25/-123.15');
  await expect(errorState(page)).toContainText(DAILY_LIMIT_MESSAGE);
});

test('P1 flags are all off in production when SOLMAP_FLAGS is unset', async ({ page }) => {
  test.skip(!!process.env.BASE_URL, 'only the server this config starts is known to run without SOLMAP_FLAGS');
  await page.goto('/report/49.25/-123.15');
  // data-flags lists the P1 flags the page was rendered with (components/report/ReportView.tsx).
  const report = page.locator('[data-flags]');
  await expect(report).toBeVisible();
  await expect(report).toHaveAttribute('data-flags', '');
});

test('health check answers ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
