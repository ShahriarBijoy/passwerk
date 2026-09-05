import { unzipSync } from 'fflate';
import type { DocumentRef } from '../model/values.js';
import { readCsv } from './csv.js';
import { readDocx } from './docx.js';
import type { PdfReadOptions } from './pdf.js';
import { readPdf } from './pdf.js';
import { readTxt } from './txt.js';
import type {
  DocumentBundle,
  Format,
  IngestedDocument,
  IngestLimits,
  InputFile,
  Page,
} from './types.js';
import { IngestFailure } from './types.js';
import { readXlsx } from './xlsx.js';

export interface IngestOptions {
  /** Forwarded to {@link readPdf}; a browser caller must set `workerSrc` (Phase 7a). */
  pdf?: PdfReadOptions;
  /** Bounds for OOXML unpacking and worksheet size; see {@link DEFAULT_INGEST_LIMITS}. */
  limits?: Partial<IngestLimits>;
}

const CONTENT_TYPES: Record<Exclude<Format, 'unsupported'>, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  txt: 'text/plain',
};

const startsWith = (bytes: Uint8Array, ascii: string) =>
  ascii.split('').every((ch, i) => bytes[i] === ch.charCodeAt(0));

/**
 * OOXML packages (xlsx, docx) are zip archives; a zip's magic bytes alone do not say which.
 * Peek at just the two part names that distinguish them, without inflating the rest of the
 * archive (spec section 4: magic-byte detection is the fallback for an unknown extension).
 */
function detectZipInner(bytes: Uint8Array): 'xlsx' | 'docx' | undefined {
  try {
    const entries = unzipSync(bytes, {
      filter: (f) => f.name === 'xl/workbook.xml' || f.name === 'word/document.xml',
    });
    if (entries['xl/workbook.xml']) return 'xlsx';
    if (entries['word/document.xml']) return 'docx';
  } catch {
    // Not a readable zip; let the caller report it as unsupported/corrupt as usual.
  }
  return undefined;
}

export function detectFormat(file: InputFile): { format: Format; contentType: string } {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  let format: Format = 'unsupported';
  if (ext === 'pdf' || startsWith(file.bytes, '%PDF')) format = 'pdf';
  else if (ext === 'xlsx' || ext === 'xlsm') format = 'xlsx';
  else if (ext === 'docx') format = 'docx';
  else if (ext === 'csv') format = 'csv';
  else if (ext === 'txt' || ext === 'md') format = 'txt';
  else if (startsWith(file.bytes, 'PK\x03\x04')) format = detectZipInner(file.bytes) ?? format;
  return {
    format,
    contentType:
      format === 'unsupported'
        ? (file.contentType ?? 'application/octet-stream')
        : CONTENT_TYPES[format],
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function readPages(
  file: InputFile,
  format: Format,
  options?: IngestOptions,
): Promise<Page[]> {
  switch (format) {
    case 'pdf':
      return readPdf(file, options);
    case 'xlsx':
      return readXlsx(file, options?.limits);
    case 'docx':
      return readDocx(file, options?.limits);
    case 'csv':
      return readCsv(file);
    case 'txt':
      return readTxt(file);
    default:
      throw new IngestFailure('unsupported', `no reader for ${file.name}`);
  }
}

function majorityLang(pages: Page[]): 'de' | 'en' {
  const en = pages.filter((p) => p.lang === 'en').length;
  return en > pages.length - en ? 'en' : 'de';
}

/**
 * Ingest every file; a failing file becomes a document with `error` and no pages. Order is
 * preserved. `options.pdf.workerSrc` is forwarded to {@link readPdf}; Node ignores it, a
 * browser caller must supply it (Phase 7a).
 */
export async function ingest(files: InputFile[], options?: IngestOptions): Promise<DocumentBundle> {
  const documents: IngestedDocument[] = [];
  for (const file of files) {
    const { format, contentType } = detectFormat(file);
    const sha256 = await sha256Hex(file.bytes);
    try {
      const pages = await readPages(file, format, options);
      documents.push({
        name: file.name,
        format,
        contentType,
        sha256,
        lang: majorityLang(pages),
        pages,
      });
    } catch (e) {
      const failure =
        e instanceof IngestFailure
          ? e
          : new IngestFailure('corrupt', e instanceof Error ? e.message : String(e));
      documents.push({
        name: file.name,
        format,
        contentType,
        sha256,
        lang: 'de',
        pages: [],
        error: { code: failure.code, message: failure.message },
      });
    }
  }
  return { documents };
}

/** A DocumentRef skeleton for part 2; the host agent adds the classification (ADR D-017). */
export function documentRefFromIngest(doc: IngestedDocument): DocumentRef {
  const title = doc.name.replace(/\.[^.]+$/, '');
  return {
    id: doc.name,
    title,
    languages: [doc.lang],
    fileName: doc.name,
    contentType: doc.contentType,
  };
}
