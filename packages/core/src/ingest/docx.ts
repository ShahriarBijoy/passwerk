import { XMLParser } from 'fast-xml-parser';
import { detectLang } from './lang.js';
import { unzipOoxml } from './ooxml.js';
import { tableRef } from './refs.js';
import { segmentsOf } from './txt.js';
import type { Cell, InputFile, Line, Page, Table } from './types.js';
import { IngestFailure } from './types.js';

/** preserveOrder node: { [tag]: OrderedNode[], ':@'?: attrs } or { '#text': string } */
type Ordered = Record<string, unknown>;

function tag(n: Ordered): string | undefined {
  return Object.keys(n).find((k) => k !== ':@');
}

function paragraphText(children: Ordered[]): string {
  let out = '';
  for (const n of children) {
    const t = tag(n);
    if (t === '#text') out += String(n['#text']);
    else if (t === 'w:tab') out += '\t';
    else if (t === 'w:br') out += '\n';
    else if (t) out += paragraphText(n[t] as Ordered[]);
  }
  return out;
}

export function readDocx(file: InputFile): Page[] {
  const files = unzipOoxml(file.bytes);
  const xml = files['word/document.xml'];
  if (!xml) throw new IngestFailure('corrupt', 'word/document.xml is missing');
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    trimValues: false,
    parseTagValue: false,
  });
  const root = parser.parse(xml) as Ordered[];
  const document = root.find((n) => tag(n) === 'w:document');
  const body = (document?.['w:document'] as Ordered[] | undefined)?.find(
    (n) => tag(n) === 'w:body',
  );
  const children = (body?.['w:body'] as Ordered[] | undefined) ?? [];

  const lines: Line[] = [];
  const tables: Table[] = [];
  for (const node of children) {
    const t = tag(node);
    if (t === 'w:p') {
      const text = paragraphText(node['w:p'] as Ordered[]).trim();
      if (text.length === 0) continue;
      lines.push({
        text,
        segments: segmentsOf(text),
        source: { file: file.name, page: 1, note: `line ${lines.length + 1}` },
      });
    } else if (t === 'w:tbl') {
      const index = tables.length + 1;
      const rows: Cell[][] = [];
      for (const tr of (node['w:tbl'] as Ordered[]).filter((n) => tag(n) === 'w:tr')) {
        const cells: Cell[] = [];
        for (const tc of (tr['w:tr'] as Ordered[]).filter((n) => tag(n) === 'w:tc')) {
          const paragraphs = (tc['w:tc'] as Ordered[])
            .filter((n) => tag(n) === 'w:p')
            .map((p) => paragraphText(p['w:p'] as Ordered[]).trim());
          const ref = tableRef(index, rows.length + 1, cells.length + 1);
          cells.push({
            text: paragraphs.join('\n').trim(),
            ref,
            source: { file: file.name, page: 1, cell: ref },
          });
        }
        rows.push(cells);
      }
      tables.push({ index, rows, source: { file: file.name, page: 1 } });
    }
  }
  const allText = [
    ...lines.map((l) => l.text),
    ...tables.flatMap((t) => t.rows.flatMap((r) => r.map((c) => c.text))),
  ].join('\n');
  return [
    {
      number: 1,
      lang: detectLang(allText),
      textless: lines.length === 0 && tables.length === 0,
      lines,
      tables,
    },
  ];
}
