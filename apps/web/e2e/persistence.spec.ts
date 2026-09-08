import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

test('decisions and step survive a reload', async ({ page }) => {
  await pinClock(page);
  await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });
  await page.getByTestId('file-input').setInputFiles(fixturePaths().slice(0, 2));
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();

  // Facts screen: edit the first fact so there is something to restore after reload.
  const row = page.getByTestId('fact-row').first();
  await row.getByTestId('fact-edit').click();
  await row.getByTestId('fact-edit-value').fill('123');
  await row.getByTestId('fact-edit-save').click();
  await expect(row.getByTestId('fact-edited')).toBeVisible();

  await page.getByTestId('facts-continue').click();
  await page.getByTestId('filter-all').click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('group').nth(i).getByTestId('accept').first().click();
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
