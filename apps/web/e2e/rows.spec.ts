import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMappings, getSample, type PassportDraft, validate } from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { CLOCK, pinClock } from './helpers.ts';

test('row editor: rows saved on ev-valid equal core for the same draft', async ({ page }) => {
  const draft = getSample('ev-valid') as PassportDraft;
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
  await page.getByTestId('import-draft').setInputFiles(path);
  await page
    .locator('[data-testid="array-entry"][data-attribute="criticalRawMaterials"]')
    .getByTestId('array-edit')
    .click();
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
  await expect(
    page.locator('[data-testid="array-entry"][data-attribute="criticalRawMaterials"]'),
  ).toContainText('2');

  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', expected.verdict);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-draft').click(),
  ]);
  const exported = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8'));
  expect(exported.attributes.criticalRawMaterials.value).toEqual(rows);
});
