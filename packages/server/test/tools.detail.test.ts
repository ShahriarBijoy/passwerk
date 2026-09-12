import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type GapBucket, type GapStatus, getSample, type MappingProposal } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, connect, memoryFileSystem } from './harness.ts';

const FIX = join(import.meta.dirname, '..', '..', 'core', 'test', 'fixtures', 'musterwerk');
const names = Object.keys(
  (
    JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8')) as {
      files: Record<string, unknown>;
    }
  ).files,
);
const bytes = Object.fromEntries(
  names.map((n) => [n, new Uint8Array(readFileSync(join(FIX, n)))]),
) as Record<string, Uint8Array<ArrayBuffer>>;

interface Ingest {
  bundleId: string;
}
interface Extract {
  factSetId: string;
}
interface Suggest {
  proposals: MappingProposal[];
  counts: { total: number; atLeast07: number; listed: number };
}
interface GapItem {
  attributeId: string;
  status: GapStatus;
  bucket: GapBucket;
}
interface GapStructured {
  draftId: string;
  completeness: {
    mandatory: { present: number; total: number };
    overall: { present: number; total: number };
  };
  items: GapItem[];
  bySubmodel: { attributeIds: string[] }[];
  byDataOwner: { attributeIds: string[] }[];
  filter?: { status?: string[]; bucket?: string[] };
}

let session: Awaited<ReturnType<typeof connect>>;
let factSetId: string;

beforeAll(async () => {
  const files = Object.fromEntries(
    names.map((n) => [`/work/docs/${n}`, bytes[n] as Uint8Array<ArrayBuffer>]),
  );
  session = await connect({ fs: memoryFileSystem(files) });
  const ing = await call<Ingest>(session.client, 'ingest_documents', { paths: ['docs'] });
  const ext = await call<Extract>(session.client, 'extract_facts', {
    bundle: { bundleId: ing.structured.bundleId },
  });
  factSetId = ext.structured.factSetId;
});
afterAll(() => session.close());

const suggest = (args: Record<string, unknown> = {}) =>
  call<Suggest>(session.client, 'suggest_mappings', {
    facts: { factSetId },
    category: 'EV',
    ...args,
  });

describe('suggest_mappings detail and attributeIds', () => {
  it('detail: full lists every proposal, one line each, with the source file name', async () => {
    const r = await suggest({ detail: 'full' });
    expect(r.isError).toBe(false);
    const bulletLines = r.text.split('\n').filter((l) => l.startsWith('- '));
    expect(bulletLines).toHaveLength(r.structured.proposals.length);
    expect(r.structured.counts.listed).toBe(r.structured.proposals.length);
    for (const p of r.structured.proposals) {
      expect(r.text).toContain(p.source[0]?.file ?? '');
    }
    for (const line of bulletLines) expect(line).toContain('·');
  });

  it('attributeIds filters proposals and the text even in summary mode, and reports unknown ids', async () => {
    const baseline = await suggest();
    const known = [...new Set(baseline.structured.proposals.slice(0, 3).map((p) => p.attributeId))];
    const attributeIds = [...known, 'totally-unknown-attribute'];
    const r = await suggest({ attributeIds });
    expect(r.isError).toBe(false);
    const idSet = new Set(known);
    expect(r.structured.proposals.length).toBeGreaterThan(0);
    expect(r.structured.proposals.every((p) => idSet.has(p.attributeId))).toBe(true);
    const bulletLines = r.text.split('\n').filter((l) => l.startsWith('- '));
    expect(bulletLines).toHaveLength(r.structured.proposals.length);
    expect(r.text).toMatch(/1 unknown attribute ids ignored: totally-unknown-attribute/);
    // Still with provenance, even though `detail` was left at the default.
    for (const line of bulletLines) expect(line).toContain('·');
  });

  it('keeps the default text byte-identical when neither detail nor attributeIds is given', async () => {
    const r = await suggest();
    expect(r.text).toMatch(
      /^\d+ proposals \(\d+ total, \d+ at confidence >= 0\.7\) for category EV\.$/m,
    );
    const bulletLines = r.text.split('\n').filter((l) => l.startsWith('- '));
    expect(bulletLines.length).toBeLessThanOrEqual(10);
    for (const line of bulletLines) expect(line).not.toContain('·');
  });

  it('German text mirrors the same shape', async () => {
    const r = await suggest({ detail: 'full', lang: 'de' });
    expect(r.text).toMatch(/^\d+ Vorschläge \(\d+ gesamt, \d+ mit Konfidenz >= 0,7\)/m);
    const bulletLines = r.text.split('\n').filter((l) => l.startsWith('- '));
    expect(bulletLines).toHaveLength(r.structured.proposals.length);
  });
});

describe('gap_report detail and filters', () => {
  it('detail: full lists every item and no "more", grouped by data owner', async () => {
    const draft = getSample('ev-valid');
    const r = await call<GapStructured>(session.client, 'gap_report', { draft, detail: 'full' });
    expect(r.isError).toBe(false);
    for (const item of r.structured.items) expect(r.text).toContain(item.attributeId);
    expect(r.text).not.toMatch(/more/);
    expect(r.text).not.toContain('…');
  });

  it('status and bucket filters reduce items, keep completeness unfiltered, and echo the filter', async () => {
    const draft = getSample('ev-valid');
    const full = await call<GapStructured>(session.client, 'gap_report', { draft });
    const filtered = await call<GapStructured>(session.client, 'gap_report', {
      draft,
      bucket: ['required'],
    });
    expect(filtered.isError).toBe(false);
    expect(filtered.structured.items.length).toBeLessThanOrEqual(full.structured.items.length);
    expect(filtered.structured.items.every((i) => i.bucket === 'required')).toBe(true);
    expect(filtered.structured.completeness).toEqual(full.structured.completeness);
    expect(filtered.structured.filter).toEqual({ bucket: ['required'] });
    expect(full.structured.filter).toBeUndefined();
    const filteredIds = new Set(filtered.structured.items.map((i) => i.attributeId));
    for (const group of filtered.structured.bySubmodel) {
      for (const id of group.attributeIds) expect(filteredIds.has(id)).toBe(true);
    }
    for (const group of filtered.structured.byDataOwner) {
      for (const id of group.attributeIds) expect(filteredIds.has(id)).toBe(true);
    }
  });

  it('status filter combined with bucket, both echoed; text reflects the filtered set', async () => {
    const draft = getSample('ev-valid');
    const r = await call<GapStructured>(session.client, 'gap_report', {
      draft,
      status: ['missing', 'invalid'],
      bucket: ['required', 'conditional'],
      detail: 'full',
    });
    expect(r.isError).toBe(false);
    expect(r.structured.filter).toEqual({
      status: ['missing', 'invalid'],
      bucket: ['required', 'conditional'],
    });
    expect(
      r.structured.items.every(
        (i) =>
          (i.status === 'missing' || i.status === 'invalid') &&
          (i.bucket === 'required' || i.bucket === 'conditional'),
      ),
    ).toBe(true);
    for (const item of r.structured.items) expect(r.text).toContain(item.attributeId);
  });

  it('a filter that matches nothing yields empty groups without breaking the text', async () => {
    const draft = getSample('ev-valid');
    const r = await call<GapStructured>(session.client, 'gap_report', {
      draft,
      status: ['conflict'],
      bucket: ['optional'],
      detail: 'full',
    });
    expect(r.isError).toBe(false);
    expect(r.structured.items).toEqual([]);
    expect(r.structured.bySubmodel).toEqual([]);
    expect(r.structured.byDataOwner).toEqual([]);
    expect(r.text).toMatch(/Mandatory \d+\/\d+/);
  });

  it('default text stays byte-identical to the unfiltered, summary-detail baseline', async () => {
    const draft = getSample('ev-valid');
    const r = await call<GapStructured>(session.client, 'gap_report', { draft });
    expect(r.text).toMatch(
      /^Mandatory \d+\/\d+ \(\d+\.\d %\), overall \d+\/\d+ \(\d+\.\d %\)\. Open mandatory: \d+\. Not legal advice\.$/m,
    );
  });

  it('a filter without detail: full still narrows the text, noting completeness is unfiltered', async () => {
    const draft = getSample('ev-valid');
    const r = await call<GapStructured>(session.client, 'gap_report', {
      draft,
      bucket: ['conditional'],
    });
    expect(r.isError).toBe(false);
    expect(r.text.toLowerCase()).toContain('whole passport');
  });
});
