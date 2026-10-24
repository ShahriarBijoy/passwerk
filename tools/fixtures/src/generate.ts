import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ModelVariant, MUSTERWERK, musterwerkContent } from './content.js';
import { writeCsv1252 } from './writers/csv.js';
import { writeDocx } from './writers/docx.js';
import { writePdf } from './writers/pdf.js';
import { writeXlsx } from './writers/xlsx.js';

export const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'core',
  'test',
  'fixtures',
  'musterwerk',
);

/** The five supplier documents of one Musterwerk battery model, keyed by file name. */
export async function musterwerkDocuments(v: ModelVariant): Promise<Record<string, Uint8Array>> {
  const c = musterwerkContent(v);
  return {
    'lieferantenerklaerung.pdf': await writePdf({
      title: c.declarationTitle,
      kv: c.declarationLines,
      table: { header: c.declarationTableHeader, rows: c.declarationTableRows },
    }),
    'stueckliste.xlsx': writeXlsx([
      { name: 'Stammdaten', rows: c.stammdaten.map(([k, v]) => [k, v]) },
      { name: 'Stückliste', rows: [c.bomHeader, ...c.bomRows] },
      { name: 'Leistung', rows: [c.leistungHeader, ...c.leistungRows] },
    ]),
    'energierechnung.pdf': await writePdf({ title: c.billTitle, kv: c.billLines }),
    'datasheet-en.csv': writeCsv1252(c.datasheetRows),
    'handover-notes.docx': writeDocx(c.handoverParagraphs, c.handoverTable),
  };
}

export function generateFixtures(): Promise<Record<string, Uint8Array>> {
  return musterwerkDocuments(MUSTERWERK);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const files = await generateFixtures();
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(FIXTURE_DIR, name), bytes);
  console.log(`wrote ${Object.keys(files).length} fixtures to ${FIXTURE_DIR}`);
}
