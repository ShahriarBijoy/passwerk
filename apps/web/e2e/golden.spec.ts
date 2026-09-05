import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BROKEN_SAMPLE_NAMES, getSample, VALID_SAMPLE_NAMES, validate } from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { CLOCK, pinClock } from './helpers.ts';

for (const name of [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES]) {
  test(`golden track: ${name}`, async ({ page }) => {
    const draft = getSample(name);
    const expected = validate(draft, { asOf: CLOCK });
    const path = join(tmpdir(), `passwerk-${name}.json`);
    writeFileSync(path, JSON.stringify(draft));

    await pinClock(page);
    await page.goto('/');
    await page.getByTestId('import-draft').setInputFiles(path);
    await expect(page.getByTestId('review-summary')).toBeVisible();
    await page.getByTestId('to-gaps').click();
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', expected.verdict);
    const shown = await page
      .getByTestId('finding')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')).sort());
    expect(shown).toEqual(expected.findings.map((f) => f.ruleId).sort());
  });
}
