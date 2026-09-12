import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import {
  closeSheet,
  expectedMusterwerk,
  fixturePaths,
  MUSTERWERK_FILES,
  openRow,
  PASSPORT_ID,
  pinClock,
  startProject,
} from './helpers.ts';

/**
 * Regenerates the screenshots in `docs/screenshots/`. Skipped by default so the ordinary `pnpm e2e`
 * run stays a behaviour suite: the walk below is slow (it accepts every Musterwerk proposal) and
 * writes into the repository, which no other spec does.
 *
 *   SCREENSHOTS=1 pnpm --filter @passwerk/web exec playwright test e2e/screenshots.spec.ts
 *
 * The six dark shots are taken at 735 x 800, the width the MCP host reports (design spec 3.1), so
 * the committed images are the frame the workbench is designed for. The one light shot is the
 * review screen at 1280 x 900, the widest the web app grows to (max-width 1024 centred).
 */
const OUT = join(import.meta.dirname, '..', '..', '..', 'docs', 'screenshots');

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUT, `workbench-${name}.png`) });
}

test.skip(!process.env['SCREENSHOTS'], 'set SCREENSHOTS=1 to regenerate docs/screenshots');

test('workbench screenshots: the six steps on the Musterwerk fixtures', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const expected = await expectedMusterwerk();
  await page.setViewportSize({ width: 735, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await pinClock(page);

  // 01 PROJECT: the screen as it first loads, before anything is filled in.
  await page.goto('/');
  await expect(page.getByTestId('obligation-verdict')).toBeVisible();
  await shot(page, '01-project');

  await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });

  // 02 DOCUMENTS: the five fixtures ingested.
  await page.getByTestId('file-input').setInputFiles(fixturePaths());
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('file-row')).toHaveCount(MUSTERWERK_FILES.length);
  await shot(page, '02-documents');

  // 03 FACTS: the extracted facts.
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('facts-count')).toBeVisible();
  await shot(page, '03-facts');
  await page.getByTestId('facts-continue').click();

  // 04 REVIEW: accept everything core would accept, then go back to the pending filter so the
  // screen shows both a decided count in the hero and undecided rows under it, with a sheet open.
  await page.getByTestId('filter-all').click();
  for (const p of expected.decisions) {
    const key = p.path === undefined ? p.attributeId : `${p.attributeId}#${p.path}`;
    await openRow(page, `[data-testid="group"][data-key="${key}"]`);
    await page
      .locator(`[data-testid="proposal"][data-fact="${p.factId}"]`)
      .getByTestId('accept')
      .click();
  }
  await closeSheet(page);
  await page.getByTestId('filter-pending').click();
  await openRow(page, '[data-testid="group"] >> nth=0');
  await shot(page, '04-review');

  // The same screen in light, at the width the web app grows to.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await shot(page, 'light-04-review');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.setViewportSize({ width: 735, height: 800 });

  // 05 GAPS: an item's sheet open over the by-owner grouping.
  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toBeVisible();
  await openRow(page, '[data-testid="gap-item"] >> nth=0');
  await shot(page, '05-gaps');

  // 06 EXPORT.
  await page.getByTestId('to-export').click();
  await expect(page.getByTestId('export-aasx')).toBeVisible();
  await shot(page, '06-export');
});
