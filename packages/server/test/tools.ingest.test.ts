import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MappingProposal } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeBase64 } from '../src/base64.ts';
import { call, connect, memoryFileSystem, TEST_CLOCK } from './harness.ts';

const FIX = join(import.meta.dirname, '..', '..', 'core', 'test', 'fixtures', 'musterwerk');

interface Expected {
  attributeId: string;
  value: string;
  unit?: string;
  path?: string;
  source: { file: string; page?: number; cell?: string; note?: string };
}
const expected = JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8')) as {
  files: Record<string, { format: string; lang: string; pages: number }>;
  attributes: Expected[];
};
const names = Object.keys(expected.files);
const bytes = Object.fromEntries(
  names.map((n) => [n, new Uint8Array(readFileSync(join(FIX, n)))]),
) as Record<string, Uint8Array<ArrayBuffer>>;

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

interface Ingest {
  bundleId: string;
  documents: { name: string; format: string; lang: string; pages: number }[];
  errors: { path: string; message: string }[];
  bundle?: { documents: unknown[] };
}

let session: Awaited<ReturnType<typeof connect>>;
beforeAll(async () => {
  const files = Object.fromEntries(
    names.map((n) => [`/work/docs/${n}`, bytes[n] as Uint8Array<ArrayBuffer>]),
  );
  session = await connect({ fs: memoryFileSystem(files) });
});
afterAll(() => session.close());

describe('ingest_documents', () => {
  it('reads a directory through the file system adapter and summarises', async () => {
    const r = await call<Ingest>(session.client, 'ingest_documents', { paths: ['docs'] });
    expect(r.isError).toBe(false);
    expect(r.structured.bundleId).toMatch(/^bnd_/);
    expect(r.structured.documents.map((d) => d.name).sort()).toEqual([...names].sort());
    for (const d of r.structured.documents) {
      const e = expected.files[d.name];
      expect({ format: d.format, lang: d.lang, pages: d.pages }, d.name).toEqual(e);
    }
    expect(r.structured.bundle).toBeUndefined();
    expect(r.structured.errors).toEqual([]);
    expect(r.text).toContain('Ingested 5 document(s)');
  });

  it('returns the full bundle on request and the same id for inline bytes', async () => {
    const full = await call<Ingest>(session.client, 'ingest_documents', {
      paths: names.map((n) => `docs/${n}`),
      detail: 'full',
      lang: 'de',
    });
    expect(full.structured.bundle?.documents).toHaveLength(5);
    expect(full.text).toContain('5 Dokument(e) eingelesen');
    const inline = await call<Ingest>(session.client, 'ingest_documents', {
      inline: names.map((n) => ({
        name: n,
        base64: encodeBase64(bytes[n] as Uint8Array<ArrayBuffer>),
      })),
    });
    expect(inline.structured.bundleId).toBe(full.structured.bundleId);
  });

  it('reports missing and out-of-root paths without dropping the rest', async () => {
    const r = await call<Ingest>(session.client, 'ingest_documents', {
      paths: ['docs/stueckliste.xlsx', 'docs/nope.pdf', '../etc/passwd'],
    });
    expect(r.isError).toBe(false);
    expect(r.structured.documents).toHaveLength(1);
    expect(r.structured.errors.map((e) => e.path)).toEqual(['docs/nope.pdf', '../etc/passwd']);
    expect(r.structured.errors[1]?.message).toMatch(/outside the configured root/);
  });

  it('refuses empty input and paths without a file system', async () => {
    const empty = await call(session.client, 'ingest_documents', {});
    expect(empty.isError).toBe(true);
    const noFs = await connect();
    try {
      const r = await call(noFs.client, 'ingest_documents', { paths: ['x.pdf'] });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/without one/);
    } finally {
      await noFs.close();
    }
  });
});

describe('extract_facts, suggest_mappings, apply_mappings, gap_report by id', () => {
  it('chains ids through the pipeline and reproduces the Musterwerk recall gate', async () => {
    const ing = await call<Ingest>(session.client, 'ingest_documents', { paths: ['docs'] });
    const ext = await call<{ factSetId: string; bundleId: string; facts: { facts: unknown[] } }>(
      session.client,
      'extract_facts',
      { bundle: { bundleId: ing.structured.bundleId } },
    );
    expect(ext.isError).toBe(false);
    expect(ext.structured.bundleId).toBe(ing.structured.bundleId);
    expect(ext.structured.facts.facts.length).toBeGreaterThan(20);
    expect(ext.text).toMatch(/^Extracted \d+ facts from 5 document/);

    const sug = await call<{
      proposals: MappingProposal[];
      counts: { total: number; atLeast07: number };
    }>(session.client, 'suggest_mappings', {
      facts: { factSetId: ext.structured.factSetId },
      category: 'EV',
      minConfidence: 0.7,
    });
    expect(sug.isError).toBe(false);
    expect(sug.structured.proposals.every((p) => p.confidence >= 0.7)).toBe(true);
    expect(sug.structured.proposals).toHaveLength(sug.structured.counts.atLeast07);
    const hits = expected.attributes.filter((e) =>
      sug.structured.proposals.some((p) => matches(p, e)),
    );
    expect(hits.length / expected.attributes.length).toBeGreaterThanOrEqual(0.8);
    expect(sug.text).toMatch(/^\d+ proposals/);

    const applied = await call<{ draftId: string; applied: number; conflicts: unknown[] }>(
      session.client,
      'apply_mappings',
      {
        meta: { category: 'EV', passportId: 'urn:passwerk:musterwerk:1', createdAt: TEST_CLOCK },
        mappings: sug.structured.proposals.map((p) => ({
          attributeId: p.attributeId,
          value: p.value,
          ...(p.unit !== undefined ? { unit: p.unit } : {}),
          ...(p.path !== undefined ? { path: p.path } : {}),
          source: p.source,
          confidence: p.confidence,
        })),
      },
    );
    expect(applied.isError).toBe(false);
    expect(applied.structured.applied).toBeGreaterThanOrEqual(25);

    const gap = await call<{
      completeness: { mandatory: { present: number; total: number } };
    }>(session.client, 'gap_report', { draft: { draftId: applied.structured.draftId } });
    expect(gap.isError).toBe(false);
    expect(gap.structured.completeness.mandatory.present).toBeGreaterThan(0);
    expect(gap.structured.completeness.mandatory.present).toBeLessThan(
      gap.structured.completeness.mandatory.total,
    );
  });

  it('rejects unknown bundle and fact set ids', async () => {
    const b = await call(session.client, 'extract_facts', { bundle: { bundleId: 'bnd_x' } });
    expect(b.isError).toBe(true);
    expect(b.text).toMatch(/Unknown bundle id/);
    const f = await call(session.client, 'suggest_mappings', {
      facts: { factSetId: 'fct_x' },
      category: 'EV',
    });
    expect(f.isError).toBe(true);
    expect(f.text).toMatch(/Unknown facts id/);
  });
});
