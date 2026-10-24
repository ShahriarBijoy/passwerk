import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest } from '@passwerk/core';

const DIR = join(import.meta.dirname, '..', 'fixtures', 'musterwerk');
const NAMES = ['energierechnung.pdf', 'lieferantenerklaerung.pdf'];

/** Golden of what plain Node reads from the two Musterwerk PDFs, shared by every runtime test. */
export const MUSTERWERK_PDF_GOLDEN = '__snapshots__/ingest.pdf.musterwerk.json';

/** Ingests both Musterwerk PDFs and returns the bundle as pretty JSON, byte-comparable. */
export async function ingestMusterwerkPdfs(): Promise<{ errors: unknown[]; json: string }> {
  const files = NAMES.map((name) => ({
    name,
    bytes: new Uint8Array(readFileSync(join(DIR, name))),
  }));
  const bundle = await ingest(files);
  const errors = bundle.documents.flatMap((d) => (d.error ? [{ name: d.name, ...d.error }] : []));
  return { errors, json: `${JSON.stringify(bundle, null, 2)}\n` };
}
