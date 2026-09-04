import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFormat, documentRefFromIngest, ingest } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, 'fixtures');
const file = (dir: string, name: string) => ({
  name,
  bytes: new Uint8Array(readFileSync(join(FIX, dir, name))),
});
const NAMES = [
  'lieferantenerklaerung.pdf',
  'stueckliste.xlsx',
  'energierechnung.pdf',
  'datasheet-en.csv',
  'handover-notes.docx',
];

describe('ingest', () => {
  it('detects formats by extension, then magic bytes', () => {
    expect(detectFormat({ name: 'a.PDF', bytes: new TextEncoder().encode('%PDF-1.7') })).toEqual({
      format: 'pdf',
      contentType: 'application/pdf',
    });
    expect(
      detectFormat({ name: 'a.bin', bytes: new TextEncoder().encode('%PDF-1.7') }).format,
    ).toBe('pdf');
    expect(detectFormat({ name: 'a.xlsx', bytes: new Uint8Array([0x50, 0x4b, 3, 4]) }).format).toBe(
      'xlsx',
    );
    expect(detectFormat({ name: 'a.exe', bytes: new Uint8Array([1, 2]) }).format).toBe(
      'unsupported',
    );
  });
  it('ingests every fixture with the expected format, language and page count', async () => {
    const expected = JSON.parse(readFileSync(join(FIX, 'musterwerk', 'expected.json'), 'utf8')) as {
      files: Record<string, { format: string; lang: string; pages: number }>;
    };
    const bundle = await ingest(NAMES.map((n) => file('musterwerk', n)));
    expect(bundle.documents.map((d) => d.name)).toEqual(NAMES);
    for (const d of bundle.documents) {
      expect(d.error, d.name).toBeUndefined();
      expect({ format: d.format, lang: d.lang, pages: d.pages.length }, d.name).toEqual(
        expected.files[d.name],
      );
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
  it('never throws: bad files get an error and zero pages', async () => {
    const bundle = await ingest([
      file('edge', 'encrypted.pdf'),
      file('edge', 'truncated.xlsx'),
      { name: 'x.exe', bytes: new Uint8Array([1]) },
    ]);
    expect(bundle.documents.map((d) => d.error?.code)).toEqual([
      'encrypted',
      'corrupt',
      'unsupported',
    ]);
    expect(bundle.documents.every((d) => d.pages.length === 0)).toBe(true);
  });
  it('is deterministic', async () => {
    const a = await ingest([file('musterwerk', 'stueckliste.xlsx')]);
    const b = await ingest([file('musterwerk', 'stueckliste.xlsx')]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('documentRefFromIngest seeds a DocumentRef for part 2', async () => {
    const [doc] = (await ingest([file('musterwerk', 'handover-notes.docx')])).documents;
    expect(documentRefFromIngest(doc!)).toEqual({
      id: 'handover-notes.docx',
      title: 'handover-notes',
      languages: ['de'],
      fileName: 'handover-notes.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  });
});
