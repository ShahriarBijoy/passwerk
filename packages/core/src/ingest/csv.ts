import { detectLang } from './lang.js';
import { rcRef } from './refs.js';
import { decodeText } from './text.js';
import type { Cell, InputFile, Line, Page, Table } from './types.js';

export type Delimiter = ';' | ',' | '\t';

/** Pick the delimiter that occurs most consistently in the first five non-empty lines; ',' by default. */
export function sniffDelimiter(text: string): Delimiter {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 5);
  let best: Delimiter = ',';
  let bestScore = 0;
  for (const d of [';', ',', '\t'] as const) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const min = Math.min(...counts, Number.POSITIVE_INFINITY);
    if (min > bestScore) {
      bestScore = min;
      best = d;
    }
  }
  return best;
}

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes; CRLF or LF rows. */
export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function readCsv(file: InputFile): Page[] {
  const text = decodeText(file.bytes);
  const rows = parseCsv(text, sniffDelimiter(text));
  const cells: Cell[][] = rows.map((r, ri) =>
    r.map((c, ci) => {
      const ref = rcRef(ri + 1, ci + 1);
      return { text: c.trim(), ref, source: { file: file.name, page: 1, cell: ref } };
    }),
  );
  const lines: Line[] = cells.map((r, ri) => {
    const segments = r.map((c) => c.text).filter((t) => t.length > 0);
    return {
      text: segments.join('  '),
      segments,
      source: { file: file.name, page: 1, note: `line ${ri + 1}` },
    };
  });
  const tables: Table[] =
    cells.length > 0 ? [{ index: 1, rows: cells, source: { file: file.name, page: 1 } }] : [];
  return [{ number: 1, lang: detectLang(text), textless: rows.length === 0, lines, tables }];
}
