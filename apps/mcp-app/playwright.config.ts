import { defineConfig } from '@playwright/test';

export const CLOCK = '2026-09-05T12:00:00.000Z';
export const TOKEN = 'e2e-token';
export const SERVER_URL = 'http://127.0.0.1:3778';

/**
 * Two servers: the real passwerk server over Streamable HTTP with a fixed clock, and the
 * preview of the dev-only host page, which proxies /mcp to it. `pnpm build && pnpm build:mcp-app
 * && pnpm --filter @passwerk/mcp-app build:host` first.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['host/**'],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4174/',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
  },
  webServer: [
    {
      command: 'node ../../packages/server/dist/bin.js --http 3778',
      url: `${SERVER_URL}/healthz`,
      env: { PASSWERK_AUTH_TOKEN: TOKEN, PASSWERK_CLOCK: CLOCK },
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: 'vite preview -c vite.host.config.ts',
      url: 'http://localhost:4174/',
      timeout: 60_000,
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
