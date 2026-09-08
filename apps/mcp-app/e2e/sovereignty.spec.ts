import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { downloads, openWorkbench } from './helpers.ts';

/**
 * No request from the host page or the workbench iframe leaves the preview origin. The MCP
 * traffic itself goes to /mcp on that origin (the preview proxies it to the passwerk server),
 * and the export leaves through the host bridge, never through the network.
 */
test('no request leaves the preview origin; exports go through the host', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost:4174/').origin;
  const foreign: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).origin !== origin) foreign.push(req.url());
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __beacons: string[] };
    w.__beacons = [];
    navigator.sendBeacon = (url: string | URL) => {
      w.__beacons.push(String(url));
      return false;
    };
  });

  const frame = await openWorkbench(page, 'ev-valid');
  await frame.getByTestId('to-gaps').click();
  await expect(frame.getByTestId('verdict')).toBeVisible();
  await frame.getByTestId('export-aasJson').click();
  await expect(page.getByTestId('host-downloads')).toContainText('application/json');
  await frame.getByTestId('export-aasx').click();
  await expect.poll(async () => (await downloads(page)).length, { timeout: 20_000 }).toBe(2);

  const beacons = await page.evaluate(
    () => (window as unknown as { __beacons: string[] }).__beacons,
  );
  const frameBeacons = await page
    .frameLocator('[data-testid="host-frame"]')
    .locator('body')
    .evaluate(() => (window as unknown as { __beacons?: string[] }).__beacons ?? []);
  expect(foreign).toEqual([]);
  expect(beacons).toEqual([]);
  expect(frameBeacons).toEqual([]);
});

/**
 * The web app's bring-your-own-key assist (ADR D-038) is a `Platform` capability, and this app
 * supplies none: its host already has a model, so a second one inside the iframe would be
 * duplicative. The claim is only worth as much as the artefact, so assert it on the built file
 * rather than on the source: no model endpoint is bundled here at all.
 */
test('the built workbench carries no model endpoint', () => {
  const html = readFileSync(join(import.meta.dirname, '..', 'dist', 'index.html'), 'utf8');
  expect(html.length).toBeGreaterThan(1000);
  for (const mark of ['api.anthropic.com', 'chat/completions', 'anthropic-version']) {
    expect(html, mark).not.toContain(mark);
  }
});
