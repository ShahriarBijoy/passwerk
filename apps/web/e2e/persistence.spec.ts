import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

test('decisions and step survive a reload', async ({ page }) => {
  await pinClock(page);
  await startProject(page, { category: 'EV', passportId: PASSPORT_ID });
  await page.getByTestId('file-input').setInputFiles(fixturePaths().slice(0, 2));
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();
  await page.getByTestId('filter-all').click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('group').nth(i).getByTestId('accept').first().click();
  }
  const summary = await page.getByTestId('review-summary').textContent();
  await page.waitForTimeout(500); // autosave debounce (300 ms)

  await page.reload();
  await expect(page.getByTestId('review-summary')).toHaveText(summary ?? '');
  await page.getByTestId('filter-accepted').click();
  await expect(page.getByTestId('group')).toHaveCount(3);
});
