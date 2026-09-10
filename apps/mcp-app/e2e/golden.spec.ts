import {
  BROKEN_SAMPLE_NAMES,
  getSample,
  VALID_SAMPLE_NAMES,
  validate,
  validateSchema,
} from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { CLOCK, downloads, openWorkbench } from './helpers.ts';

/**
 * Every golden sample handed to `review_passport` renders on the review step with core's
 * verdict and finding ids; the HTML export leaves through the host's downloadFile.
 */
for (const name of [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES]) {
  test(`golden track: ${name}`, async ({ page }) => {
    const draft = getSample(name);
    const expected = validate(draft, { asOf: CLOCK });
    const frame = await openWorkbench(page, name);
    await frame.getByTestId('to-gaps').click();
    await expect(frame.getByTestId('verdict')).toHaveAttribute('data-verdict', expected.verdict);
    await frame.getByTestId('gaps-view-findings').click();
    const shown = await frame
      .getByTestId('finding')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')).sort());
    expect(shown).toEqual(expected.findings.map((f) => f.ruleId).sort());

    if (validateSchema(draft).draft !== undefined) {
      await frame.getByTestId('to-export').click();
      await expect(frame.getByTestId('export-html')).toBeVisible();
      await frame.getByTestId('export-html').click();
      await expect(page.getByTestId('host-downloads')).toContainText('text/html');
      const [d] = await downloads(page);
      const res = d?.contents[0]?.resource;
      expect(res?.uri).toMatch(/^passwerk:\/\/export\/.+\.html$/);
      const html = Buffer.from(res?.blob ?? '', 'base64').toString('utf8');
      expect(html).toContain(`<span class="verdict ${expected.verdict}">`);
      for (const f of expected.findings) expect(html).toContain(f.ruleId);
    }
  });
}
