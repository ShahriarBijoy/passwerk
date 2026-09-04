import { z } from 'zod';
import { Format, IngestError, Lang } from '../ingest/types.js';
import { Provenance } from '../model/provenance.js';

export const FactKind = z.enum(['decimal', 'integer', 'date', 'boolean', 'uri', 'text']);
export type FactKind = z.infer<typeof FactKind>;
export const FactShape = z.enum(['kv', 'header-cell', 'sheet-pair']);
export type FactShape = z.infer<typeof FactShape>;

export const Fact = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  labelKey: z.string(),
  raw: z.string(),
  value: z.string().optional(),
  kind: FactKind,
  unit: z.string().optional(),
  rawUnit: z.string().optional(),
  lang: Lang,
  shape: FactShape,
  rowLabel: z.string().optional(),
  source: Provenance,
});
export type Fact = z.infer<typeof Fact>;

export const TableFact = z.object({
  id: z.string().min(1),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  source: Provenance,
  lang: Lang,
});
export type TableFact = z.infer<typeof TableFact>;

export const DocumentSummary = z.object({
  name: z.string().min(1),
  format: Format,
  contentType: z.string(),
  lang: Lang,
  pages: z.number().int().nonnegative(),
  sha256: z.string(),
  error: IngestError.optional(),
});
export type DocumentSummary = z.infer<typeof DocumentSummary>;

export const FactSet = z.object({
  facts: z.array(Fact),
  tables: z.array(TableFact),
  documents: z.array(DocumentSummary),
});
export type FactSet = z.infer<typeof FactSet>;
