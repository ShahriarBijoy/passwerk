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

/**
 * The pdfjs worker module, as a variable so bundlers leave it alone: only a Node caller
 * loads it, and the browser apps ship their own worker asset instead.
 */
const PDF_WORKER = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
let mainThreadWorker: Promise<unknown> | undefined;

/**
 * pdfjs decides at load time whether it runs in Node, and an Electron utility process (how
 * Claude Desktop runs a local extension) fails that test: pdfjs then asks for a worker script.
 * Importing the worker module sets `globalThis.pdfjsWorker`, which pdfjs uses on the main
 * thread before it looks for `workerSrc`. Plain Node reaches the same handler on its own.
 */
function loadMainThreadWorker(): Promise<unknown> {
  mainThreadWorker ??= import(/* @vite-ignore */ PDF_WORKER);
  return mainThreadWorker;
}

function isNodeRuntime(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: unknown } } }).process;
  return typeof proc?.versions?.node === 'string';
}

export interface PdfReadOptions {
  /**
   * `pdfjs-dist` needs a worker script in a browser; it throws
   * `No "GlobalWorkerOptions.workerSrc" specified` without one. A browser caller (Phase 7a)
   * must supply it, typically a URL to the `pdf.worker.min.mjs` asset it bundles alongside
   * pdfjs-dist. A Node caller leaves it out: pdfjs then runs on the main thread, also inside an
   * Electron utility process that pdfjs would otherwise take for a browser (ADR D-051).
   */
  workerSrc?: string;
}

/**
 * Reads a PDF's text, tables and per-page language. In a browser, pass
 * `{ pdf: { workerSrc } }` (via {@link ingest}'s `options.pdf` or directly here) before the
 * first call; Node, Electron's Node included, needs nothing.
 */
export async function readPdf(
  file: InputFile,
  options?: { pdf?: PdfReadOptions },
): Promise<Page[]> {
  const pdfjs = await loadPdfJs();
  if (options?.pdf?.workerSrc !== undefined) {
    pdfjs.GlobalWorkerOptions.workerSrc = options.pdf.workerSrc;
  } else if (isNodeRuntime()) {
    await loadMainThreadWorker();
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(file.bytes),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
  });
  try {
    let pdf: Awaited<typeof task.promise>;
    try {
      pdf = await task.promise;
    } catch (e) {
      const name = (e as { name?: string }).name ?? '';
      if (name === 'PasswordException')
        throw new IngestFailure('encrypted', `${file.name} is password protected`);
      throw new IngestFailure('corrupt', `${file.name}: ${String((e as Error).message ?? e)}`);
    }
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
      await page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
