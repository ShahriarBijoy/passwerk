import { expect, test } from '@playwright/test';
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

test('Musterwerk track: upload, accept >= 0.7, gaps match core', async ({ page }) => {
  const expected = await expectedMusterwerk();
  await pinClock(page);
  // startProject asserts the derived EV category on the project screen itself.
  await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });

  await page.getByTestId('file-input').setInputFiles(fixturePaths());
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  const rows = page.getByTestId('file-row');
  await expect(rows).toHaveCount(MUSTERWERK_FILES.length);
  for (const doc of expected.bundle.documents) {
    const row = page.locator(`[data-testid="file-row"][data-file="${doc.name}"]`);
    await expect(row.getByTestId('file-pages')).toHaveText(String(doc.pages.length));
  }
  await expect(page.getByTestId('continue')).toHaveText(new RegExp(`${expected.proposals.length}`));
  await page.getByTestId('continue').click();

  // Facts screen: core extracted the same number of facts as the app shows. A word-boundary
  // regex, not a substring, so e.g. 18 does not also satisfy a rendered 118.
  await expect(page.getByTestId('facts-count')).toHaveText(
    new RegExp(`\\b${expected.facts.facts.length}\\b`),
  );
  await page.getByTestId('facts-continue').click();

  // Accept the first proposal at >= 0.7 in each group, exactly as the Node helper did.
  // The default filter is "pending", which hides a group as soon as it is decided.
  await page.getByTestId('filter-all').click();
  for (const p of expected.decisions) {
    const key = p.path === undefined ? p.attributeId : `${p.attributeId}#${p.path}`;
    await openRow(page, `[data-testid="group"][data-key="${key}"]`);
    await page
      .locator(`[data-testid="proposal"][data-fact="${p.factId}"]`)
      .getByTestId('accept')
      .click();
  }
  await expect(page.getByTestId('review-summary')).toContainText(String(expected.decisions.length));

  // The last decision's sheet is still open (filter-all does not advance it away); close it
  // first (see `closeSheet` in helpers.ts).
  await closeSheet(page);
  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute(
    'data-verdict',
    expected.report.verdict,
  );
  await expect(page.getByTestId('completeness-mandatory')).toContainText(
    expected.gap.completeness.mandatory.percent,
  );

  await page.getByTestId('gaps-view-findings').click();
  const shownFindings = await page
    .getByTestId('finding')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')).sort());
  expect(shownFindings).toEqual(expected.report.findings.map((f) => f.ruleId).sort());

  await page.getByTestId('gaps-view-owner').click();
  await page.getByTestId('gaps-filter-all').click();
  const shownItems = await page
    .getByTestId('gap-item')
    .evaluateAll((els) =>
      els
        .map(
          (e) =>
            `${e.getAttribute('data-attribute')}:${e.getAttribute('data-status')}:${e.getAttribute('data-bucket')}`,
        )
        .sort(),
    );
  expect(shownItems).toEqual(
    expected.gap.items.map((i) => `${i.attributeId}:${i.status}:${i.bucket}`).sort(),
  );
});
