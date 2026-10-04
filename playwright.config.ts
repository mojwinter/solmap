// pnpm test:e2e: smoke test of the production build against the synthetic roofs (.github/workflows/e2e.yml).
// Needs `SOLAR_SOURCE=fixtures pnpm build` first; this serves .next/standalone the way docker/Dockerfile does.
// Set BASE_URL to test a server you already started instead (e.g. `pnpm dev` on :3000).
// CI installs Playwright's own Chromium. Where a different Chromium is preinstalled (Claude Code cloud
// sessions: /opt/pw-browsers/chromium), point CHROMIUM_PATH at it instead of running `playwright install`.
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const external = process.env.BASE_URL;

// Lay the standalone server out like the image (static assets, public, fixtures), then run it.
const serve = [
  'cp -r public .next/standalone/',
  'cp -r .next/static .next/standalone/.next/',
  'mkdir -p .next/standalone/fixtures',
  'cp -r fixtures/synthetic .next/standalone/fixtures/',
  'node .next/standalone/server.js',
].join(' && ');

export default defineConfig({
  testDir: 'e2e',
  // *.e2e.ts, so Vitest's default *.test/*.spec glob never picks these up.
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: external ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external
    ? undefined
    : {
        command: serve,
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        // Synthetic roofs only: never calls Google, needs no key.
        env: { PORT: String(PORT), HOSTNAME: '127.0.0.1', SOLAR_SOURCE: 'fixtures', NEXT_TELEMETRY_DISABLED: '1' },
      },
});
