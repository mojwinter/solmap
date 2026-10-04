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
  /** Intercept the building API (loading / error states). */
  api?: 'hang' | 'upstream';
  /** Don't wait for the report to finish loading. */
  loading?: boolean;
  /** The API answers 4xx/5xx on purpose: the browser's "Failed to load resource" log is expected. */
  httpError?: boolean;
}

// Synthetic roofs (fixtures/synthetic/*): each served at its own centre in SOLAR_SOURCE=fixtures.
const CASES: Case[] = [
  { name: 'hero', path: '/report/49.25/-123.15?address=4127%20Oak%20Street' },
  {
    name: 'hero-15-panels',
    path: '/report/49.25/-123.15?address=4127%20Oak%20Street',
    act: async (page) => {
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'More panels' }).click();
    },
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

// Desktop: let the results panel grow to its full height so one image shows everything.
const UNCLIP = 'aside{max-height:none!important;overflow:visible!important}';

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only'))
    ? (process.argv[process.argv.indexOf('--only') + 1] ?? '').split(',')
    : null;
  const cases = only ? CASES.filter((c) => only.includes(c.name)) : CASES;
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
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
        problems.push(`${tag} console: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`${tag} pageerror: ${e.message}`));
      if (c.api === 'hang') await page.route('**/api/solar/building**', () => new Promise(() => {}));
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

      await page.screenshot({ path: path.join(OUT, `${c.name}-${vpName}.png`) });
      if (vpName === 'desktop') await page.addStyleTag({ content: UNCLIP });
      await page.screenshot({ path: path.join(OUT, `${c.name}-${vpName}-full.png`), fullPage: true });
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
