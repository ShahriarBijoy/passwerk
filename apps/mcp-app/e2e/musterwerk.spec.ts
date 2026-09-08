import { expect, test } from '@playwright/test';
import {
  expectedMusterwerk,
  fixturePaths,
  lastContext,
  MUSTERWERK_FILES,
  openWorkbench,
  PASSPORT_ID,
  startProject,
} from './helpers.ts';

/**
 * The Phase 7a Musterwerk track, inside the host's sandboxed iframe: the five fixtures enter
 * through the file input, core ingests them in the iframe, every proposal at >= 0.7 is
 * accepted, and verdict, findings and gap items equal core's Node results for the same inputs
 * and clock. Then the model-context check: the last context the workbench pushed names the
 * verdict the screen shows.
 */
test('Musterwerk track inside the MCP App iframe', async ({ page }) => {
  const expected = await expectedMusterwerk();
  const frame = await openWorkbench(page, 'none');
  await startProject(frame, PASSPORT_ID);

  await frame.getByTestId('file-input').setInputFiles(fixturePaths());
  await expect(frame.getByTestId('upload-busy')).toHaveCount(0, { timeout: 90_000 });
  await expect(frame.getByTestId('file-row')).toHaveCount(MUSTERWERK_FILES.length);
  for (const doc of expected.bundle.documents) {
    const row = frame.locator(`[data-testid="file-row"][data-file="${doc.name}"]`);
    await expect(row.getByTestId('file-pages')).toHaveText(String(doc.pages.length));
  }
  await expect(frame.getByTestId('continue')).toHaveText(
    new RegExp(`${expected.proposals.length}`),
  );
  await frame.getByTestId('continue').click();

  await expect(frame.getByTestId('facts-count')).toHaveText(
    new RegExp(`\\b${expected.facts.facts.length}\\b`),
  );
  await frame.getByTestId('facts-continue').click();

  await frame.getByTestId('filter-all').click();
  for (const p of expected.decisions) {
    const key = p.path === undefined ? p.attributeId : `${p.attributeId}#${p.path}`;
    await frame
      .locator(`[data-testid="group"][data-key="${key}"]`)
      .locator(`[data-testid="proposal"][data-fact="${p.factId}"]`)
      .getByTestId('accept')
      .click();
  }
  await expect(frame.getByTestId('review-summary')).toContainText(
    String(expected.decisions.length),
  );

  await frame.getByTestId('to-gaps').click();
  await expect(frame.getByTestId('verdict')).toHaveAttribute(
    'data-verdict',
    expected.report.verdict,
  );
  await expect(frame.getByTestId('completeness-mandatory')).toContainText(
    expected.gap.completeness.mandatory.percent,
  );
  const shownFindings = await frame
    .getByTestId('finding')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')).sort());
  expect(shownFindings).toEqual(expected.report.findings.map((f) => f.ruleId).sort());
  const shownItems = await frame
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

  // The model sees the same verdict and completeness the screen shows. The verdict alone is
  // `invalid` from the first context on, so poll on both until the last decision has synced.
  await expect
    .poll(
      async () => {
        const c = (await lastContext(page)).structuredContent;
        return `${c.verdict} ${c.mandatoryCompleteness}`;
      },
      { timeout: 20_000 },
    )
    .toBe(`${expected.report.verdict} ${expected.gap.completeness.mandatory.percent}`);
  const ctx = await lastContext(page);
  expect(ctx.content[0]?.text).toMatch(/^passwerk-Werkbank/);
  expect(ctx.content[0]?.text).toContain(ctx.structuredContent.draftId);
});
