import { detectLang } from './lang.js';
import { textOf, unzipOoxml, xmlParser } from './ooxml.js';
import { a1, parseA1 } from './refs.js';
import type { Cell, CellKind, InputFile, Line, Page, Table } from './types.js';
import { IngestFailure, type IngestLimits, resolveLimits } from './types.js';

type Node = Record<string, unknown>;
const arr = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : []);
const attr = (n: Node, name: string): string => String(n[`@_${name}`] ?? '');

const DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormat(code: string): boolean {
  const stripped = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
  return /[dy]/i.test(stripped) && /m/i.test(stripped);
}

/** Excel 1900 date system: serial 1 = 1900-01-01; serial 60 (the fake 1900-02-29) is skipped by using 1899-12-30 as epoch. */
export function serialToIsoDate(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

interface Workbook {
  sheets: { name: string; path: string }[];
  shared: string[];
  dateStyles: Set<number>;
}

function loadWorkbook(files: Record<string, string>): Workbook {
  const parser = xmlParser();
  const wbXml = files['xl/workbook.xml'];
  if (!wbXml) throw new IngestFailure('corrupt', 'xl/workbook.xml is missing');
  const wb = parser.parse(wbXml) as Node;
  const rels = parser.parse(files['xl/_rels/workbook.xml.rels'] ?? '<Relationships/>') as Node;
  const relMap = new Map<string, string>();
  for (const r of arr((rels['Relationships'] as Node | undefined)?.['Relationship'])) {
    const target = attr(r, 'Target');
    relMap.set(attr(r, 'Id'), target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const sheets = arr(
    ((wb['workbook'] as Node | undefined)?.['sheets'] as Node | undefined)?.['sheet'],
  ).map((s) => ({
    name: attr(s, 'name'),
    path: relMap.get(attr(s, 'r:id')) ?? '',
  }));

  const shared: string[] = [];
  const sstXml = files['xl/sharedStrings.xml'];
  if (sstXml) {
    const sst = parser.parse(sstXml) as Node;
    for (const si of arr((sst['sst'] as Node | undefined)?.['si'])) {
      shared.push(textOf(si['t'] ?? si['r']));
    }
  }

  const dateStyles = new Set<number>();
  const stylesXml = files['xl/styles.xml'];
  if (stylesXml) {
    const styles = (parser.parse(stylesXml) as Node)['styleSheet'] as Node | undefined;
    const custom = new Map<number, string>();
    for (const f of arr((styles?.['numFmts'] as Node | undefined)?.['numFmt']))
      custom.set(Number(attr(f, 'numFmtId')), attr(f, 'formatCode'));
    arr((styles?.['cellXfs'] as Node | undefined)?.['xf']).forEach((xf, i) => {
      const id = Number(attr(xf, 'numFmtId'));
      if (DATE_FMT_IDS.has(id) || isDateFormat(custom.get(id) ?? '')) dateStyles.add(i);
    });
  }
  return { sheets, shared, dateStyles };
}

function cellValue(c: Node, wb: Workbook): { text: string; kind: CellKind } {
  const t = attr(c, 't');
  const v = c['v'] === undefined ? '' : textOf(c['v']);
  if (t === 's') return { text: wb.shared[Number(v)] ?? '', kind: 'text' };
  if (t === 'str') return { text: v, kind: 'text' };
  if (t === 'inlineStr')
    return { text: textOf((c['is'] as Node | undefined)?.['t']), kind: 'text' };
  if (t === 'b') return { text: v === '1' ? 'true' : 'false', kind: 'boolean' };
  if (t === 'e') return { text: v, kind: 'text' };
  if (v === '') return { text: '', kind: 'text' };
  const style = Number(attr(c, 's') || '0');
  if (wb.dateStyles.has(style)) return { text: serialToIsoDate(Number(v)), kind: 'date' };
  return { text: v, kind: 'number' };
}

const byNumber = (a: number, b: number) => a - b;

/**
 * One page per sheet. The worksheet is kept **sparse** (issue #15): only occupied cells are
 * read, empty rows and columns are dropped from the table, and every cell keeps its original
 * A1 reference and its row number in the line provenance. A single cell at Z1000 therefore
 * costs one Cell, not 26,000. `limits` bound the occupied-cell count and the compacted grid.
 */
export function readXlsx(file: InputFile, limits: Partial<IngestLimits> = {}): Page[] {
  const lim = resolveLimits(limits);
  const files = unzipOoxml(file.bytes, lim);
  const wb = loadWorkbook(files);
  const parser = xmlParser();
  let totalCells = 0;
  return wb.sheets.map((sheet, si) => {
    const xml = files[sheet.path];
    if (!xml) throw new IngestFailure('corrupt', `sheet part ${sheet.path} is missing`);
    const ws = (parser.parse(xml) as Node)['worksheet'] as Node | undefined;
    const grid = new Map<string, { text: string; kind: CellKind }>();
    const rowSet = new Set<number>();
    const colSet = new Set<number>();
    for (const row of arr((ws?.['sheetData'] as Node | undefined)?.['row'])) {
      for (const c of arr(row['c'])) {
        const ref = attr(c, 'r');
        if (!ref) continue;
        let coord: { row: number; col: number };
        try {
          coord = parseA1(ref);
        } catch (e) {
          throw new IngestFailure('corrupt', e instanceof Error ? e.message : String(e));
        }
        if (coord.row < 1 || coord.col < 1 || coord.row > lim.maxRows || coord.col > lim.maxCols) {
          throw new IngestFailure(
            'corrupt',
            `cell reference ${ref} is outside the allowed range (rows 1..${lim.maxRows}, columns 1..${lim.maxCols})`,
          );
        }
        const value = cellValue(c, wb);
        if (value.text.trim().length === 0) continue;
        if (!grid.has(ref)) {
          totalCells += 1;
          if (totalCells > lim.maxCells) {
            throw new IngestFailure(
              'limit_exceeded',
              `workbook has more occupied cells than the limit of ${lim.maxCells} cells`,
            );
          }
        }
        grid.set(ref, { text: value.text.trim(), kind: value.kind });
        rowSet.add(coord.row);
        colSet.add(coord.col);
      }
    }
    const rowIndex = [...rowSet].sort(byNumber);
    const colIndex = [...colSet].sort(byNumber);
    if (rowIndex.length * colIndex.length > lim.maxGridCells) {
      throw new IngestFailure(
        'limit_exceeded',
        `sheet ${sheet.name} compacts to a grid of ${rowIndex.length} x ${colIndex.length} cells, above the limit of ${lim.maxGridCells} cells`,
      );
    }
    const rows: Cell[][] = [];
    const lines: Line[] = [];
    for (const r of rowIndex) {
      const cells: Cell[] = [];
      for (const col of colIndex) {
        const ref = a1(r, col);
        const v = grid.get(ref);
        const qualified = `${sheet.name}!${ref}`;
        cells.push({
          text: v?.text ?? '',
          ref: qualified,
          kind: v?.kind ?? 'text',
          source: { file: file.name, page: si + 1, cell: qualified },
        });
      }
      rows.push(cells);
      const segments = cells.map((c) => c.text).filter((t) => t.length > 0);
      lines.push({
        text: segments.join('  '),
        segments,
        source: { file: file.name, page: si + 1, note: `line ${r}` },
      });
    }
    const first = rowIndex[0];
    const firstCol = colIndex[0];
    const tables: Table[] =
      rows.length > 0 && first !== undefined && firstCol !== undefined
        ? [
            {
              index: 1,
              rows,
              source: {
                file: file.name,
                page: si + 1,
                cell: `${sheet.name}!${a1(first, firstCol)}`,
              },
            },
          ]
        : [];
    const allText = lines.map((l) => l.text).join('\n');
    return {
      number: si + 1,
      title: sheet.name,
      lang: detectLang(allText),
      textless: rows.length === 0,
      lines,
      tables,
    };
  });
}
