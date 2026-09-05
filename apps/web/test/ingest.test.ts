import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestFiles } from '@/workflow/ingest.ts';

const FIX = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'core',
  'test',
  'fixtures',
  'musterwerk',
);
const file = (name: string) => {
  const bytes = new Uint8Array(readFileSync(join(FIX, name)));
  return { name, bytes, size: bytes.byteLength };
};

describe('ingestFiles', () => {
  it('summarises every file and proposes mappings', async () => {
    const out = await ingestFiles([file('stueckliste.xlsx'), file('datasheet-en.csv')], {
      category: 'EV',
    });
    expect(out.summaries.map((s) => [s.name, s.format, s.pages, s.lang])).toEqual([
      ['stueckliste.xlsx', 'xlsx', 3, 'de'],
      ['datasheet-en.csv', 'csv', 1, 'en'],
    ]);
    expect(out.summaries[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.proposals.length).toBeGreaterThan(0);
    expect(
      out.facts.facts.every((f) =>
        ['stueckliste.xlsx', 'datasheet-en.csv'].includes(f.source.file),
      ),
    ).toBe(true);
  }, 30_000);

  it('a corrupt file yields an error summary without failing the batch', async () => {
    const bad = {
      name: 'broken.xlsx',
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
      size: 7,
    };
    const out = await ingestFiles([bad, file('datasheet-en.csv')], { category: 'EV' });
    expect(out.summaries[0]?.error?.code).toBeDefined();
    expect(out.summaries[1]?.error).toBeUndefined();
  });
});
