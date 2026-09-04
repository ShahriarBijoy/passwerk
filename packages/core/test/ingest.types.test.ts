import { DocumentBundle, IngestedDocument, InputFile, Page } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('ingest types', () => {
  it('InputFile requires a name and bytes', () => {
    expect(InputFile.safeParse({ name: 'a.txt', bytes: new Uint8Array([1]) }).success).toBe(true);
    expect(InputFile.safeParse({ name: '', bytes: new Uint8Array() }).success).toBe(false);
    expect(InputFile.safeParse({ name: 'a.txt', bytes: 'text' }).success).toBe(false);
  });
  it('a Page carries lines and tables with provenance', () => {
    const page = Page.parse({
      number: 1,
      lang: 'de',
      textless: false,
      lines: [{ text: 'a', segments: ['a'], source: { file: 'f.txt', note: 'line 1' } }],
      tables: [],
    });
    expect(page.lines[0]?.source.note).toBe('line 1');
    expect(
      Page.safeParse({ number: 0, lang: 'de', textless: false, lines: [], tables: [] }).success,
    ).toBe(false);
  });
  it('an IngestedDocument may carry an error and no pages', () => {
    const doc = IngestedDocument.parse({
      name: 'x.bin',
      format: 'unsupported',
      contentType: 'application/octet-stream',
      sha256: 'ab'.repeat(32),
      lang: 'de',
      pages: [],
      error: { code: 'unsupported', message: 'no reader for .bin' },
    });
    expect(DocumentBundle.parse({ documents: [doc] }).documents).toHaveLength(1);
  });
});
