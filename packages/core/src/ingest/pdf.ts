import { detectLang } from './lang.js';
import { linesFromItems, rowCells, type TextItem, tablesFromLines } from './layout.js';
import { tableRef } from './refs.js';
import type { Cell, InputFile, Line, Page, Table } from './types.js';
import { IngestFailure } from './types.js';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJs> | undefined;

/** Loaded lazily so drafts that never see a PDF do not pay for the engine. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export async function readPdf(file: InputFile): Promise<Page[]> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(file.bytes),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  });
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (e) {
    const name = (e as { name?: string }).name ?? '';
    if (name === 'PasswordException')
      throw new IngestFailure('encrypted', `${file.name} is password protected`);
    throw new IngestFailure('corrupt', `${file.name}: ${String((e as Error).message ?? e)}`);
  }
  try {
    const pages: Page[] = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = content.items
        .filter(
          (
            i,
          ): i is typeof i & { str: string; transform: number[]; width: number; height: number } =>
            'str' in i,
        )
        .map((i) => ({
          str: i.str,
          x: i.transform[4] as number,
          y: i.transform[5] as number,
          width: i.width,
          height: i.height,
        }));
      const layout = linesFromItems(items);
      const lines: Line[] = layout.map((l, i) => ({
        text: l.segments.map((s) => s.text).join('  '),
        segments: l.segments.map((s) => s.text),
        source: { file: file.name, page: n, note: `line ${i + 1}` },
      }));
      const tables: Table[] = tablesFromLines(layout).map((t, ti) => {
        const index = ti + 1;
        const rows: Cell[][] = [];
        for (let li = t.start; li <= t.end; li += 1) {
          const cells = rowCells(layout[li] as (typeof layout)[number], t.columns).map(
            (text, ci) => {
              const ref = tableRef(index, rows.length + 1, ci + 1);
              return { text, ref, source: { file: file.name, page: n, cell: ref } };
            },
          );
          rows.push(cells);
        }
        return { index, rows, source: { file: file.name, page: n } };
      });
      pages.push({
        number: n,
        lang: detectLang(lines.map((l) => l.text).join('\n')),
        textless: lines.length === 0,
        lines,
        tables,
      });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
