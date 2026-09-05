import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '@passwerk/cli';
import type { MappingProposal } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { captureIo, MUSTERWERK, musterwerkFiles, utf8 } from './harness.ts';

interface Expected {
  attributeId: string;
  value: string;
  unit?: string;
  path?: string;
  source: { file: string; page?: number; cell?: string; note?: string };
}
const expected = JSON.parse(readFileSync(join(MUSTERWERK, 'expected.json'), 'utf8')) as {
  attributes: Expected[];
};

const matches = (p: MappingProposal, e: Expected) =>
  p.attributeId === e.attributeId &&
  p.value === e.value &&
  (e.unit === undefined || p.unit === e.unit) &&
  (e.path === undefined || p.path === e.path) &&
  p.source.some((s) => s.file === `docs/${e.source.file}`);

const files = musterwerkFiles();

// The first run loads pdfjs lazily; the server suite budgets the same.
describe('passwerk extract', { timeout: 30000 }, () => {
  it('ingests a directory, extracts facts and reports counts', async () => {
    const io = captureIo(files);
    expect(await run(['extract', 'docs'], io)).toBe(0);
    expect(io.out()).toContain('Ingested 5 document(s)');
    expect(io.out()).toMatch(/Extracted \d+ facts from 5 document/);
    expect(io.out()).not.toContain('proposals');
  });

  it('--category adds mapping proposals and reproduces the Musterwerk recall gate', async () => {
    const io = captureIo(files);
    expect(await run(['extract', 'docs', '--category', 'EV', '--out', 'facts.json'], io)).toBe(0);
    expect(io.out()).toMatch(
      /\d+ proposals \(\d+ total, \d+ at confidence >= 0\.7\) for category EV/,
    );
    const written = io.fs.written.get('/work/facts.json');
    expect(written).toBeDefined();
    const parsed = JSON.parse(utf8(written as Uint8Array)) as {
      bundleId: string;
      factSetId: string;
      category: string;
      documents: { name: string }[];
      facts: { facts: unknown[] };
      proposals: MappingProposal[];
    };
    expect(parsed.bundleId).toMatch(/^bnd_/);
    expect(parsed.factSetId).toMatch(/^fct_/);
    expect(parsed.category).toBe('EV');
    expect(parsed.documents).toHaveLength(5);
    expect(parsed.facts.facts.length).toBeGreaterThan(20);
    const confident = parsed.proposals.filter((p) => p.confidence >= 0.7);
    const hits = expected.attributes.filter((e) => confident.some((p) => matches(p, e)));
    // The Phase 4 gate: 32 of 34 (the two misses are `not_displayed` for EV).
    expect(hits.length).toBeGreaterThanOrEqual(32);
  });

  it('explicit files work too and --json prints the same structure', async () => {
    const io = captureIo(files);
    expect(
      await run(
        ['extract', 'docs/lieferantenerklaerung.pdf', 'docs/stueckliste.xlsx', '--json'],
        io,
      ),
    ).toBe(0);
    const parsed = JSON.parse(io.out()) as { documents: { name: string }[]; proposals?: unknown };
    expect(parsed.documents.map((d) => d.name)).toEqual([
      'docs/lieferantenerklaerung.pdf',
      'docs/stueckliste.xlsx',
    ]);
    expect(parsed.proposals).toBeUndefined();
  });

  it('a missing path is reported; with no document read at all the exit is 3', async () => {
    const io = captureIo(files);
    expect(await run(['extract', 'docs/nope.pdf'], io)).toBe(3);
    expect(io.err()).toMatch(/docs\/nope\.pdf: not found/);
    const partial = captureIo(files);
    expect(await run(['extract', 'docs/nope.pdf', 'docs/datasheet-en.csv'], partial)).toBe(0);
    expect(partial.err()).toMatch(/docs\/nope\.pdf: not found/);
    expect(partial.out()).toContain('Ingested 1 document(s)');
  });

  it('an unknown category is a usage error (3)', async () => {
    const io = captureIo(files);
    expect(await run(['extract', 'docs', '--category', 'XX'], io)).toBe(3);
    expect(io.err()).toMatch(/category/);
  });

  it('two runs are byte-identical', async () => {
    const a = captureIo(files);
    const b = captureIo(files);
    await run(['extract', 'docs', '--category', 'EV', '--json'], a);
    await run(['extract', 'docs', '--category', 'EV', '--json'], b);
    expect(a.out()).toBe(b.out());
    expect(a.out().length).toBeGreaterThan(1000);
  });
});
