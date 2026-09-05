import { z } from 'zod';
import { Provenance } from '../model/provenance.js';

export const Lang = z.enum(['de', 'en']);
export type Lang = z.infer<typeof Lang>;

export const Format = z.enum(['pdf', 'xlsx', 'csv', 'docx', 'txt', 'unsupported']);
export type Format = z.infer<typeof Format>;

export const InputFile = z.object({
  name: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
  contentType: z.string().min(1).optional(),
});
export type InputFile = z.infer<typeof InputFile>;

export const CellKind = z.enum(['text', 'number', 'date', 'boolean']);
export type CellKind = z.infer<typeof CellKind>;

export const Cell = z.object({
  text: z.string(),
  ref: z.string().min(1),
  /** Set by readers that know the stored type (XLSX). 'number' cells are canonical decimals. */
  kind: CellKind.optional(),
  source: Provenance,
});
export type Cell = z.infer<typeof Cell>;

export const Table = z.object({
  index: z.number().int().positive(),
  rows: z.array(z.array(Cell)),
  source: Provenance,
});
export type Table = z.infer<typeof Table>;

export const Line = z.object({
  text: z.string(),
  segments: z.array(z.string()),
  source: Provenance,
});
export type Line = z.infer<typeof Line>;

export const Page = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1).optional(),
  lang: Lang,
  textless: z.boolean(),
  lines: z.array(Line),
  tables: z.array(Table),
});
export type Page = z.infer<typeof Page>;

export const IngestErrorCode = z.enum([
  'unsupported',
  'encrypted',
  'corrupt',
  'undecodable',
  'limit_exceeded',
]);
export type IngestErrorCode = z.infer<typeof IngestErrorCode>;

export const IngestError = z.object({ code: IngestErrorCode, message: z.string().min(1) });
export type IngestError = z.infer<typeof IngestError>;

export const IngestedDocument = z.object({
  name: z.string().min(1),
  format: Format,
  contentType: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  lang: Lang,
  pages: z.array(Page),
  error: IngestError.optional(),
});
export type IngestedDocument = z.infer<typeof IngestedDocument>;

export const DocumentBundle = z.object({ documents: z.array(IngestedDocument) });
export type DocumentBundle = z.infer<typeof DocumentBundle>;

/**
 * Bounds on what a single input may cost (issue #15). Every limit is checked before the
 * corresponding allocation, and exceeding one is reported as `limit_exceeded`, never as a
 * crash. Adapters may tighten them (a browser tab, an HTTP request) but should not need to.
 */
export interface IngestLimits {
  /** Largest accepted input file, in bytes. */
  maxInputBytes: number;
  /** Most entries an OOXML zip may list. */
  maxArchiveEntries: number;
  /** Most bytes the XML parts of one OOXML package may inflate to, in total. */
  maxExpandedBytes: number;
  /** Most occupied cells across all sheets of one workbook. */
  maxCells: number;
  /** Most cells in a sheet's compacted grid (occupied rows x occupied columns). */
  maxGridCells: number;
  /** Largest accepted row index (Excel's own limit). */
  maxRows: number;
  /** Largest accepted column index (Excel's own limit). */
  maxCols: number;
}

export const DEFAULT_INGEST_LIMITS: Readonly<IngestLimits> = Object.freeze({
  maxInputBytes: 64 * 1024 * 1024,
  maxArchiveEntries: 5_000,
  maxExpandedBytes: 256 * 1024 * 1024,
  maxCells: 1_000_000,
  maxGridCells: 4_000_000,
  maxRows: 1_048_576,
  maxCols: 16_384,
});

export function resolveLimits(limits: Partial<IngestLimits> = {}): IngestLimits {
  return { ...DEFAULT_INGEST_LIMITS, ...limits };
}

/** Thrown by readers; `ingest` turns it into `IngestedDocument.error`. */
export class IngestFailure extends Error {
  constructor(
    readonly code: IngestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IngestFailure';
  }
}
