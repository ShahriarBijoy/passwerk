import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractFacts, ingest, type MappingProposal, suggestMappings } from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, 'fixtures', 'musterwerk');
interface Expected {
  attributeId: string;
  value: string;
  unit?: string;
  path?: string;
  source: { file: string; page?: number; cell?: string; note?: string };
}
const expected = JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8')) as {
  files: Record<string, unknown>;
  attributes: Expected[];
  negatives: string[];
};

let proposals: MappingProposal[];
beforeAll(async () => {
  const bundle = await ingest(
    Object.keys(expected.files).map((name) => ({
      name,
      bytes: new Uint8Array(readFileSync(join(FIX, name))),
    })),
  );
  proposals = suggestMappings(extractFacts(bundle), { category: 'EV' });
});

const matches = (p: MappingProposal, e: Expected) =>
  p.attributeId === e.attributeId &&
  p.value === e.value &&
  (e.unit === undefined || p.unit === e.unit) &&
  (e.path === undefined || p.path === e.path) &&
  p.source.some(
    (s) =>
      s.file === e.source.file &&
      s.page === e.source.page &&
      s.cell === e.source.cell &&
      s.note === e.source.note,
  );

describe('Phase 4 definition of done', () => {
  it('>= 80 % of expected attributes are proposed at confidence >= 0.7 with the expected provenance', () => {
    const hits = expected.attributes.filter((e) =>
      proposals.some((p) => p.confidence >= 0.7 && matches(p, e)),
    );
    const misses = expected.attributes
      .filter((e) => !hits.includes(e))
      .map(
        (e) =>
          `${e.attributeId} from ${e.source.file}${e.source.cell ? ` ${e.source.cell}` : ''}${e.source.note ? ` ${e.source.note}` : ''}`,
      );
    const ratio = hits.length / expected.attributes.length;
    expect(
      ratio,
      `recall ${(ratio * 100).toFixed(0)} %, missed: ${misses.join(', ')}`,
    ).toBeGreaterThanOrEqual(0.8);
  });
  it('every proposal at confidence >= 0.9 is an expected one', () => {
    const confident = proposals.filter((p) => p.confidence >= 0.9);
    const wrong = confident
      .filter((p) => !expected.attributes.some((e) => matches(p, e)))
      .map(
        (p) =>
          `${p.attributeId} <- "${p.checks.matched}" ${JSON.stringify(p.source)} (${p.confidence})`,
      );
    expect(wrong, wrong.join('\n')).toEqual([]);
  });
  it('negative controls produce nothing at confidence >= 0.7', () => {
    const leaked = proposals.filter(
      (p) => p.confidence >= 0.7 && p.source.some((s) => expected.negatives.includes(s.file)),
    );
    expect(leaked.map((p) => `${p.attributeId} ${p.checks.matched} ${p.confidence}`)).toEqual([]);
  });
});
