import { expect, test } from '@playwright/test';
import {
  closeSheet,
  fixturePaths,
  openRow,
  PASSPORT_ID,
  pinClock,
  startProject,
} from './helpers.ts';

test('decisions and step survive a reload', async ({ page }) => {
  await pinClock(page);
  await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });
  await page.getByTestId('file-input').setInputFiles(fixturePaths().slice(0, 2));
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();

  // Facts screen: edit the first fact so there is something to restore after reload.
  const row = page.getByTestId('fact-row').first();
  const factId = await row.getAttribute('data-fact');
  await openRow(page, `[data-testid="fact-row"][data-fact="${factId}"]`);
  await page.getByTestId('fact-edit').click();
  await page.getByTestId('fact-edit-value').fill('123');
  await page.getByTestId('fact-edit-save').click();
  await expect(row.getByTestId('fact-edited')).toBeVisible();

  // The edited fact's sheet is still open; close it first (see `closeSheet` in helpers.ts).
  await closeSheet(page);
  await page.getByTestId('facts-continue').click();
  await page.getByTestId('filter-all').click();
  for (let i = 0; i < 3; i++) {
    const key = await page.getByTestId('group').nth(i).getAttribute('data-key');
    await openRow(page, `[data-testid="group"][data-key="${key}"]`);
    await page.getByTestId('accept').first().click();
  }
  const summary = await page.getByTestId('review-summary').textContent();
  // The debounce is 300 ms; the poll only proves the IndexedDB database exists before waiting
  // out the debounce, replacing a fixed wait that raced the write.
  await expect
    .poll(async () => page.evaluate(() => indexedDB.databases().then((d) => d.length)), {
      timeout: 5000,
    })
    .toBeGreaterThan(0);
  await page.waitForTimeout(400);

  await page.reload();
  await expect(page.getByTestId('review-summary')).toHaveText(summary ?? '');
  await page.getByTestId('filter-accepted').click();
  await expect(page.getByTestId('group')).toHaveCount(3);

  await page.getByTestId('step-facts').click();
  await expect(page.getByTestId('fact-row').first().getByTestId('fact-edited')).toBeVisible();
});
