import type { DocumentRef } from '../model/values.js';
import { readCsv } from './csv.js';
import { readDocx } from './docx.js';
import { readPdf } from './pdf.js';
import { readTxt } from './txt.js';
import type { DocumentBundle, Format, IngestedDocument, InputFile, Page } from './types.js';
import { IngestFailure } from './types.js';
import { readXlsx } from './xlsx.js';

const CONTENT_TYPES: Record<Exclude<Format, 'unsupported'>, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  txt: 'text/plain',
};

const startsWith = (bytes: Uint8Array, ascii: string) =>
  ascii.split('').every((ch, i) => bytes[i] === ch.charCodeAt(0));

export function detectFormat(file: InputFile): { format: Format; contentType: string } {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  let format: Format = 'unsupported';
  if (ext === 'pdf' || startsWith(file.bytes, '%PDF')) format = 'pdf';
  else if (ext === 'xlsx' || ext === 'xlsm') format = 'xlsx';
  else if (ext === 'docx') format = 'docx';
  else if (ext === 'csv') format = 'csv';
  else if (ext === 'txt' || ext === 'md') format = 'txt';
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

async function readPages(file: InputFile, format: Format): Promise<Page[]> {
  switch (format) {
    case 'pdf':
      return readPdf(file);
    case 'xlsx':
      return readXlsx(file);
    case 'docx':
      return readDocx(file);
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

/** Ingest every file; a failing file becomes a document with `error` and no pages. Order is preserved. */
export async function ingest(files: InputFile[]): Promise<DocumentBundle> {
  const documents: IngestedDocument[] = [];
  for (const file of files) {
    const { format, contentType } = detectFormat(file);
    const sha256 = await sha256Hex(file.bytes);
    try {
      const pages = await readPages(file, format);
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
          : new IngestFailure('corrupt', String((e as Error).message ?? e));
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
