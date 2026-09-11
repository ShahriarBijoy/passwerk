import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMappings, getSample, validate, validateSchema } from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { CLOCK, openRow, openSection, pinClock } from './helpers.ts';

test('row editor: rows saved on ev-valid equal core for the same draft', async ({ page }) => {
  const parsed = validateSchema(getSample('ev-valid'));
  if (!parsed.draft) throw new Error('ev-valid sample no longer parses against the schema');
  const draft = parsed.draft;
  const path = join(tmpdir(), 'passwerk-rows-ev-valid.json');
  writeFileSync(path, JSON.stringify(draft));
  const rows = [
    { name: 'Lithium', identifier: '7439-93-2' },
    { name: 'Cobalt', identifier: '7440-48-4', massKg: '1.5' },
  ];
  const expected = validate(
    applyMappings(draft, [{ attributeId: 'criticalRawMaterials', value: rows, override: true }])
      .draft,
    { asOf: CLOCK },
  );

  await pinClock(page);
  await page.goto('/');
  await openSection(page, 'import');
  await page.getByTestId('import-draft').setInputFiles(path);
  await openRow(page, '[data-testid="array-entry"][data-attribute="criticalRawMaterials"]');
  await page.getByTestId('array-edit').click();
  // count() does not auto-wait; without this the dialog may not have mounted yet, the removal
  // loop below would be skipped, and the later unscoped rows-field-name fill would hit a
  // strict-mode violation against more than one row.
  await expect(page.getByTestId('rows-row').first()).toBeVisible();
  const rowCount = await page.getByTestId('rows-row').count();
  for (let i = rowCount - 1; i >= 0; i--) await page.getByTestId('rows-remove').nth(i).click();
  await page.getByTestId('rows-add').click();
  await page.getByTestId('rows-field-name').fill('Lithium');
  await page.getByTestId('rows-save').click();
  await expect(page.getByTestId('rows-error')).toContainText('Zeile 1');
  await page.getByTestId('rows-field-identifier').fill('7439-93-2');
  await page.getByTestId('rows-add').click();
  const second = page.getByTestId('rows-row').nth(1);
  await second.getByTestId('rows-field-name').fill('Cobalt');
  await second.getByTestId('rows-field-identifier').fill('7440-48-4');
  await second.getByTestId('rows-field-massKg').fill('1.5');
  await page.getByTestId('rows-save').click();
  // A leading word-boundary, not a plain substring, so "12 Zeilen" cannot satisfy an expectation
  // of "2". No trailing boundary: the card's next text node ("manuell" or the edit button label)
  // butts up against "Zeilen" with no space in the flattened text content.
  await expect(
    page.locator('[data-testid="array-entry"][data-attribute="criticalRawMaterials"]'),
  ).toHaveText(/\b2 Zeilen/);

  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', expected.verdict);
  await page.getByTestId('to-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-draft').click(),
  ]);
  const exported = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8'));
  expect(exported.attributes.criticalRawMaterials.value).toEqual(rows);
});
