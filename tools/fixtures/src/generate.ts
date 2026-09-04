import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as c from './content.js';
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

export async function generateFixtures(): Promise<Record<string, Uint8Array>> {
  return {
    'lieferantenerklaerung.pdf': await writePdf({
      title: 'Lieferantenerklärung Batteriesystem MW-EV-2026-000123',
      kv: c.DECLARATION_LINES,
      table: { header: c.DECLARATION_TABLE_HEADER, rows: c.DECLARATION_TABLE_ROWS },
    }),
    'stueckliste.xlsx': writeXlsx([
      { name: 'Stammdaten', rows: c.STAMMDATEN.map(([k, v]) => [k, v]) },
      { name: 'Stückliste', rows: [c.BOM_HEADER, ...c.BOM_ROWS] },
      { name: 'Leistung', rows: [c.LEISTUNG_HEADER, ...c.LEISTUNG_ROWS] },
    ]),
    'energierechnung.pdf': await writePdf({ title: 'Stromrechnung August 2026', kv: c.BILL_LINES }),
    'datasheet-en.csv': writeCsv1252(c.DATASHEET_ROWS),
    'handover-notes.docx': writeDocx(c.HANDOVER_PARAGRAPHS, c.HANDOVER_TABLE),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const files = await generateFixtures();
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(FIXTURE_DIR, name), bytes);
  console.log(`wrote ${Object.keys(files).length} fixtures to ${FIXTURE_DIR}`);
}
