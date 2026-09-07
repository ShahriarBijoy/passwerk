import { readFileSync } from 'node:fs';
import { attributes, carrierSchemes } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';
import { REVIEW_SHEET_PATH, renderReviewSheet } from '../scripts/review-sheet.ts';

describe('docs/KB_REVIEW.md', () => {
  it('lists every verify: true attribute and matches a fresh render', () => {
    const flagged = attributes.filter((a) => a.verify);
    const sheet = renderReviewSheet();
    for (const a of flagged) expect(sheet).toContain(`### \`${a.id}\``);
    expect(sheet).toContain(
      `## Summary: ${flagged.length} of ${attributes.length} attributes flagged`,
    );
    expect(readFileSync(REVIEW_SHEET_PATH, 'utf8').replace(/\r\n/g, '\n')).toBe(sheet);
  });
  it('every entry carries both languages and a decision line', () => {
    const sheet = renderReviewSheet();
    const entries = sheet.split('\n### ').slice(1);
    expect(entries.length).toBe(attributes.filter((a) => a.verify).length);
    for (const e of entries) {
      expect(e).toContain('**Explanation (en):**');
      expect(e).toContain('**Erklärung (de):**');
      expect(e).toContain('**Reviewer decision:**');
    }
  });
  it('lists every carrier scheme marked verify', () => {
    const sheet = renderReviewSheet();
    expect(sheet).toContain('## Carrier schemes');
    for (const s of carrierSchemes.filter((s) => s.verify)) {
      expect(sheet).toContain(`| \`${s.id}\` |`);
    }
  });
});
