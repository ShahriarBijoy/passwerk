import { describe, expect, it } from 'vitest';
import ec from '../kb/ec-datapoints.json' with { type: 'json' };

const CATEGORIES = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'] as const;
const dp = (n: number) => {
  const d = ec.dataPoints[n - 1];
  if (!d) throw new Error(`no data point ${n}`);
  return d;
};
const STATUSES = ['mandatory', 'optional', 'conditional', 'not_yet_applicable', 'not_displayed'];

describe('kb/ec-datapoints.json (EC guidance v2.0, 71 data points)', () => {
  it('has exactly the 71 data points numbered 1..71 in order', () => {
    expect(ec.dataPoints).toHaveLength(71);
    expect(ec.dataPoints.map((d) => d.number)).toEqual(Array.from({ length: 71 }, (_, i) => i + 1));
  });

  it('declares the three passport categories', () => {
    expect(ec.categories).toEqual([...CATEGORIES]);
  });

  it('gives every data point a name, a legal reference and a status for each category', () => {
    for (const dp of ec.dataPoints) {
      expect(dp.name.length, `#${dp.number} name`).toBeGreaterThan(3);
      expect(dp.legalRef, `#${dp.number} legalRef`).toMatch(
        /^BR (Article \d+\(\d+\)|Annex (VI Part A|XIII) .+)$/,
      );
      for (const cat of CATEGORIES) {
        const cell = dp.applicability[cat];
        expect(STATUSES, `#${dp.number} ${cat}`).toContain(cell.status);
        if (cell.status !== 'mandatory') {
          expect(
            (cell as { text?: string }).text,
            `#${dp.number} ${cat} needs the guidance wording`,
          ).toBeTruthy();
        }
      }
    }
  });

  it('every status used is described in the vocabulary', () => {
    const used = new Set(
      ec.dataPoints.flatMap((dp) => CATEGORIES.map((c) => dp.applicability[c].status)),
    );
    for (const s of used) expect(Object.keys(ec.statusVocabulary)).toContain(s);
  });

  it('encodes the v2.0 deferrals: carbon footprint, recycled content, due diligence and instructions are not yet applicable', () => {
    const deferred = [17, 18, 19, 20, 21, 22, 23, 44];
    for (const n of deferred) {
      for (const cat of CATEGORIES)
        expect(dp(n).applicability[cat].status, `#${n} ${cat}`).toBe('not_yet_applicable');
    }
  });

  it('encodes the category-specific state-of-health split (SOCE for EV, remaining capacity etc. for LMT)', () => {
    expect(dp(61).applicability.EV.status).toBe('mandatory');
    expect(dp(61).applicability.LMT.status).toBe('not_displayed');
    expect(dp(62).applicability.EV.status).toBe('not_displayed');
    expect(dp(62).applicability.LMT.status).toBe('mandatory');
    expect(dp(62).applicability.INDUSTRIAL_GT_2KWH.status).toBe('conditional');
  });
});
