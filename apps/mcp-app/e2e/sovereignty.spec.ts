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
