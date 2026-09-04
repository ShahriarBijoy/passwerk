import { zipSync } from 'fflate';
import { ZIP_MTIME } from '../content.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
const tbl = (rows: string[][]) =>
  `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;

export function writeDocx(paragraphs: string[], table: string[][]): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': enc(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    '_rels/.rels': enc(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    'word/document.xml': enc(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(p).join('')}${tbl(table)}${p('Ende der Übergabedokumentation.')}</w:body></w:document>`,
    ),
  };
  const ordered: Record<string, [Uint8Array, { mtime: Date; level: 6 }]> = {};
  for (const key of Object.keys(files).sort())
    ordered[key] = [files[key] as Uint8Array, { mtime: ZIP_MTIME, level: 6 }];
  return zipSync(ordered);
}
