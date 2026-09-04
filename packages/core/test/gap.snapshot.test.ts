import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  gapReport,
  PassportDraft,
  validate,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('gap report snapshots', () => {
  for (const name of BROKEN_SAMPLE_NAMES) {
    it(`is stable for ${name}`, () => {
      const draft = PassportDraft.parse(brokenSamples[name].draft);
      const report = gapReport(draft, { report: validate(draft) });
      // Snapshot a digest rather than the whole report: the full item list is 93 entries and
      // would bury a real change in noise.
      expect({
        category: report.category,
        completeness: report.completeness,
        buckets: report.items.reduce<Record<string, number>>((acc, i) => {
          acc[i.bucket] = (acc[i.bucket] ?? 0) + 1;
          return acc;
        }, {}),
        statuses: report.items.reduce<Record<string, number>>((acc, i) => {
          acc[i.status] = (acc[i.status] ?? 0) + 1;
          return acc;
        }, {}),
        invalid: report.items.filter((i) => i.status === 'invalid').map((i) => i.attributeId),
      }).toMatchSnapshot();
    });
  }
});
