// pnpm ui:shots: screenshot every report screen and state at desktop and phone widths, so UI changes
// get looked at before they're pushed. Needs the dev server on fixtures (`SOLAR_SOURCE=fixtures pnpm dev`).
//
//   pnpm ui:shots                      # all cases → .next/ui-shots/
//   pnpm ui:shots -- --only hero,weak  # some cases
//   BASE_URL=http://localhost:3001 OUT=/tmp/shots pnpm ui:shots
//
// Fails (exit 1) on any console error or uncaught page error.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? path.join(process.cwd(), '.next', 'ui-shots');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const;

interface Case {
  name: string;
  path: string;
  /** Runs after load, before the screenshots. */
  act?: (page: Page) => Promise<void>;
  /** Intercept the building API (loading / error states, or a roof Google places outside BC). */
  api?: 'hang' | 'upstream' | 'outside-bc-area';
  /** Don't wait for the report to finish loading. */
  loading?: boolean;
  /** The API answers 4xx/5xx on purpose: the browser's "Failed to load resource" log is expected. */
  httpError?: boolean;
}

// Synthetic roofs (fixtures/synthetic/*): each served at its own centre in SOLAR_SOURCE=fixtures.
const CASES: Case[] = [
  // Nothing on the landing waits for client JS, so let it hydrate before the screenshot touches the DOM.
  { name: 'landing', path: '/', act: (page) => page.waitForLoadState('networkidle') },
  { name: 'hero', path: '/report/49.25/-123.15?address=4127%20Oak%20Street' },
  {
    name: 'hero-15-panels',
    path: '/report/49.25/-123.15?address=4127%20Oak%20Street',
    act: async (page) => {
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'More panels' }).click();
    },
  },
  {
    name: 'bill-2-months',
    path: '/report/49.25/-123.15',
    act: async (page) => {
      await page.getByRole('tab', { name: 'Your usage' }).click();
      await page.getByLabel('Bill amount').fill('240');
      await page.getByRole('button', { name: '2 months' }).click();
    },
  },
  {
    name: 'annual-kwh-flat',
    path: '/report/49.25/-123.15',
    act: async (page) => {
      await page.getByRole('tab', { name: 'Your usage' }).click();
      await page.getByRole('button', { name: 'Annual usage (kWh)' }).click();
      await page.getByLabel('Electricity used in a year').fill('16000');
      await page.getByRole('button', { name: 'Flat' }).click();
    },
  },
  // Near the border: the API normally 404s these, so fake a 200 to see the fallback banner.
  { name: 'outside-bc-area', path: '/report/49.25/-123.15', api: 'outside-bc-area' },
  {
    name: 'roof-tab',
    path: '/report/49.25/-123.15',
    act: (page) => page.getByRole('tab', { name: 'Roof' }).click(),
  },
  { name: 'weak-shaded', path: '/report/49.2615/-123.1702' },
  { name: 'tiny-roof', path: '/report/49.888/-119.496' },
  { name: 'multi-unit', path: '/report/49.1666/-123.1336' },
  { name: 'base-quality', path: '/report/50.6745/-120.3273' },
  { name: 'east-west', path: '/report/48.4265/-123.3165' },
  { name: 'flat-roof', path: '/report/49.2488/-122.98' },
  { name: 'no-coverage', path: '/report/49.3/-123.1', httpError: true },
  { name: 'outside-bc', path: '/report/10/10', httpError: true },
  { name: 'bad-url', path: '/report/abc/-123', httpError: true },
  { name: 'loading', path: '/report/49.25/-123.15', api: 'hang', loading: true },
  { name: 'api-error', path: '/report/49.25/-123.15', api: 'upstream', httpError: true },
];

// Without NEXT_PUBLIC_MAPS_API_KEY (CI, most laptops) Google runs the map in development mode and
// logs this on every page. It's about the key, not our UI.
const NO_MAPS_KEY = /Google Maps JavaScript API error: ApiProjectMapError/;

// Desktop: let the results panel grow to its full height so one image shows everything.
const UNCLIP = 'aside{max-height:none!important;overflow:visible!important}';

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only'))
    ? (process.argv[process.argv.indexOf('--only') + 1] ?? '').split(',')
    : null;
  const cases = only ? CASES.filter((c) => only.includes(c.name)) : CASES;
  await mkdir(OUT, { recursive: true });

  // CHROMIUM_PATH: a preinstalled Chromium (Claude Code cloud sessions: /opt/pw-browsers/chromium), as in playwright.config.ts.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const problems: string[] = [];

  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: 'reduce',
      isMobile: vpName === 'phone',
      hasTouch: vpName === 'phone',
      deviceScaleFactor: vpName === 'phone' ? 2 : 1,
    });
    for (const c of cases) {
      const page = await context.newPage();
      const tag = `${c.name}@${vpName}`;
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        if (c.httpError && m.text().startsWith('Failed to load resource')) return;
        if (NO_MAPS_KEY.test(m.text())) return;
        problems.push(`${tag} console: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`${tag} pageerror: ${e.message}`));
      if (c.api === 'hang') await page.route('**/api/solar/building**', () => new Promise(() => {}));
      if (c.api === 'outside-bc-area') {
        await page.route('**/api/solar/building**', async (r) => {
          const res = await r.fetch();
          r.fulfill({ response: res, json: { ...(await res.json()), administrativeArea: 'WA' } });
        });
      }
      if (c.api === 'upstream') {
        await page.route('**/api/solar/building**', (r) =>
          r.fulfill({ status: 502, json: { error: 'UPSTREAM', message: "The solar data service didn't answer. Please try again in a minute." } }),
        );
      }

      await page.goto(BASE + c.path, { waitUntil: 'domcontentloaded' });
      if (!c.loading) {
        await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 });
      } else {
        await page.waitForSelector('[aria-busy="true"]');
      }
      await page.evaluate(() => document.fonts.ready);
      // Next's dev-mode badge isn't part of the UI and covers content on phones.
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      if (c.act) await c.act(page);

      // caret: 'initial' — the default hides the caret with a style that can land before hydration (hydration mismatch).
      await page.screenshot({ path: path.join(OUT, `${c.name}-${vpName}.png`), caret: 'initial' });
      if (vpName === 'desktop') await page.addStyleTag({ content: UNCLIP });
      await page.screenshot({ path: path.join(OUT, `${c.name}-${vpName}-full.png`), fullPage: true, caret: 'initial' });
      await page.close();
    }
    await context.close();
  }
  await browser.close();

  console.log(`Screenshots: ${OUT}`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
