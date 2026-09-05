import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

test('no request leaves the preview origin during the Musterwerk track', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
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
  await pinClock(page);
  await startProject(page, { category: 'EV', passportId: PASSPORT_ID });
  await page.getByTestId('file-input').setInputFiles(fixturePaths());
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();
  await page.getByTestId('filter-all').click();
  await page.getByTestId('accept').first().click();
  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toBeVisible();
  await page.getByTestId('export-aasJson').click();

  const beacons = await page.evaluate(
    () => (window as unknown as { __beacons: string[] }).__beacons,
  );
  expect(foreign).toEqual([]);
  expect(beacons).toEqual([]);
});
