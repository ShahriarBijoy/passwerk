import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFormat, documentRefFromIngest, ingest } from '@passwerk/core';
import { describe, expect, it, vi } from 'vitest';

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

// A reader can only throw Error or IngestFailure in practice, but `ingest` must not assume
// that: `throw null` (or any other thrown value) must still surface as a valid IngestError.
vi.mock('../src/ingest/txt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ingest/txt.js')>();
  return {
    ...actual,
    readTxt: () => {
      throw null;
    },
  };
});

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
  it('routes extension-less OOXML uploads by inner zip content (spec section 4)', () => {
    const xlsxBytes = new Uint8Array(readFileSync(join(FIX, 'musterwerk', 'stueckliste.xlsx')));
    const docxBytes = new Uint8Array(readFileSync(join(FIX, 'musterwerk', 'handover-notes.docx')));
    expect(detectFormat({ name: 'upload', bytes: xlsxBytes })).toEqual({
      format: 'xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(detectFormat({ name: 'upload', bytes: docxBytes })).toEqual({
      format: 'docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    // Extension still wins when it names a known format, even for an OOXML-looking payload.
    expect(detectFormat({ name: 'upload.csv', bytes: xlsxBytes }).format).toBe('csv');
    // A zip that is neither xlsx nor docx (or not a zip at all) stays unsupported.
    expect(detectFormat({ name: 'upload', bytes: new Uint8Array([0x50, 0x4b, 3, 4]) }).format).toBe(
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
  it('never throws even when a reader throws a non-Error value', async () => {
    const bundle = await ingest([{ name: 'x.txt', bytes: new TextEncoder().encode('hi') }]);
    expect(bundle.documents[0]!.error).toEqual({ code: 'corrupt', message: 'null' });
    expect(bundle.documents[0]!.pages).toEqual([]);
  });
  it('accepts a pdf.workerSrc option and ignores it on non-PDF files (Node needs no worker)', async () => {
    const bundle = await ingest([file('musterwerk', 'stueckliste.xlsx')], {
      pdf: { workerSrc: 'about:blank' },
    });
    expect(bundle.documents[0]!.error).toBeUndefined();
    expect(bundle.documents[0]!.format).toBe('xlsx');
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
