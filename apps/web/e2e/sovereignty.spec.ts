import { expect, test } from '@playwright/test';
import {
  fixturePaths,
  openRow,
  openSection,
  PASSPORT_ID,
  pinClock,
  startProject,
} from './helpers.ts';

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
  await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });
  await page.getByTestId('file-input').setInputFiles(fixturePaths());
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();

  // Facts screen: edit one fact, then map an unmapped one by hand.
  const firstFactId = await page.getByTestId('fact-row').first().getAttribute('data-fact');
  await openRow(page, `[data-testid="fact-row"][data-fact="${firstFactId}"]`);
  await page.getByTestId('fact-edit').click();
  await page.getByTestId('fact-edit-value').fill('123');
  await page.getByTestId('fact-edit-save').click();

  await page.getByTestId('facts-status-unmapped').click();
  const unmappedId = await page.getByTestId('fact-row').first().getAttribute('data-fact');
  await openRow(page, `[data-testid="fact-row"][data-fact="${unmappedId}"]`);
  await page.getByTestId('fact-map').click();
  await page.getByTestId('add-attribute').click();
  await page.getByRole('option', { name: /nominalVoltage/ }).click();
  await page.getByTestId('add-value-input').fill('400');
  await page.getByTestId('add-unit-input').fill('V');
  await page.getByTestId('add-submit').click();

  await page.getByTestId('facts-continue').click();
  await page.getByTestId('filter-all').click();
  const firstGroupKey = await page.getByTestId('group').first().getAttribute('data-key');
  await openRow(page, `[data-testid="group"][data-key="${firstGroupKey}"]`);
  await page.getByTestId('accept').first().click();
  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toBeVisible();

  // Project screen again: switch the identifier to GS1 so the QR preview renders, before exporting.
  await page.getByTestId('step-project').click();
  await openSection(page, 'identifier');
  await page.getByTestId('identifier-mode-gs1').click();
  await page.getByTestId('identifier-resolver').fill('https://id.example.com');
  await page.getByTestId('identifier-gtin').fill('96385074');
  await page.getByTestId('identifier-serial').fill('SN-1');
  await expect(page.getByTestId('qr-image')).toBeVisible();
  await page.getByTestId('step-gaps').click();
  await page.getByTestId('to-export').click();
  await page.getByTestId('export-aasJson').click();

  const beacons = await page.evaluate(
    () => (window as unknown as { __beacons: string[] }).__beacons,
  );
  expect(foreign).toEqual([]);
  expect(beacons).toEqual([]);
});
