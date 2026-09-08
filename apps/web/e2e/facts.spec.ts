import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

// The first proposed fact of lieferantenerklaerung.pdf (in facts.facts order) maps to
// manufacturerInformation#name.de, a composite leaf holding a free-text string, not a decimal
// attribute. Probed with core in Node (ingest -> extractFacts -> suggestMappings over just this
// fixture): the fifth fact, "Nennkapazität:" (lieferantenerklaerung.pdf#1:5), maps to the scalar
// decimal attribute ratedCapacity, whose schema accepts a plain "777". Pinning this id keeps the
// oracle comparison meaningful instead of relying on whatever proposal happens to render first.
const PINNED_FACT_ID = 'lieferantenerklaerung.pdf#1:5';

test('facts: an edited value reaches the draft; a mapped fact keeps its provenance', async ({
  page,
}) => {
  await pinClock(page);
  await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });
  await page.getByTestId('file-input').setInputFiles(fixturePaths().slice(0, 1)); // lieferantenerklaerung.pdf
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();

  // Edit the pinned proposed fact (ratedCapacity, a scalar decimal attribute).
  await page.getByTestId('facts-status-proposed').click();
  const row = page.locator(`[data-testid="fact-row"][data-fact="${PINNED_FACT_ID}"]`);
  const factId = PINNED_FACT_ID;
  await row.getByTestId('fact-edit').click();
  await row.getByTestId('fact-edit-value').fill('777');
  await row.getByTestId('fact-edit-save').click();
  await expect(row.getByTestId('fact-edited')).toBeVisible();

  // Map the first unmapped fact to nominalVoltage.
  await page.getByTestId('facts-status-unmapped').click();
  const unmapped = page.getByTestId('fact-row').first();
  const unmappedId = await unmapped.getAttribute('data-fact');
  await unmapped.getByTestId('fact-map').click();
  await page.getByTestId('add-attribute').click();
  await page.getByRole('option', { name: /nominalVoltage/ }).click();
  await page.getByTestId('add-value-input').fill('400');
  await page.getByTestId('add-unit-input').fill('V');
  await page.getByTestId('add-submit').click();
  // The status tab is a live filter: once mapped, the row drops out of "unmapped". Switch to
  // "all" to find it again and check the status the mapping actually produced.
  await page.getByTestId('facts-status-all').click();
  await expect(page.locator(`[data-testid="fact-row"][data-fact="${unmappedId}"]`)).toHaveAttribute(
    'data-status',
    'mapped',
  );

  await page.getByTestId('facts-continue').click();
  await page.getByTestId('filter-all').click();
  await page
    .locator(`[data-testid="proposal"][data-fact="${factId}"]`)
    .first()
    .getByTestId('accept')
    .click();
  await page.getByTestId('to-gaps').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-draft').click(),
  ]);
  const draft = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8'));
  const values = JSON.stringify(draft.attributes);
  expect(values).toContain('"777"');
  expect(draft.attributes.nominalVoltage.value).toBe('400');
  expect(draft.attributes.nominalVoltage.source[0].file).toBe('lieferantenerklaerung.pdf');
});
