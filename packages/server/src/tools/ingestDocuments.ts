import { type DocumentBundle, type IngestedDocument, type InputFile, ingest } from '@passwerk/core';
import { z } from 'zod';
import { decodeBase64 } from '../base64.js';
import {
  type FileSystemAdapter,
  out,
  PathOutsideRootError,
  type ToolDefinition,
} from '../types.js';

const SUPPORTED = new Set(['pdf', 'xlsx', 'csv', 'docx', 'txt']);

const inputSchema = {
  paths: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Files or directories on the server’s file system (a directory contributes its PDF, XLSX, CSV, DOCX and TXT files, non-recursive). Preferred for local installs',
    ),
  inline: z
    .array(z.object({ name: z.string().min(1), base64: z.string() }))
    .optional()
    .describe('Document bytes as base64, for hosts that cannot pass paths'),
  detail: z
    .enum(['summary', 'full'])
    .optional()
    .describe(
      'summary (default): per-document counts and the bundleId; full: the whole DocumentBundle',
    ),
  limits: z
    .looseObject({})
    .optional()
    .describe('Partial IngestLimits override (maxInputBytes, maxCells, ...)'),
};

const documentSummary = z.object({
  name: z.string(),
  format: z.string(),
  contentType: z.string(),
  sha256: z.string(),
  lang: z.string(),
  pages: z.number(),
  tables: z.number(),
  lines: z.number(),
  error: z.looseObject({ code: z.string(), message: z.string() }).optional(),
});
export type DocumentSummary = z.infer<typeof documentSummary>;

const outputSchema = out({
  bundleId: z.string().optional(),
  documents: z.array(documentSummary).optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  bundle: z.looseObject({ documents: z.array(z.looseObject({})) }).optional(),
});

export function summarise(doc: IngestedDocument): DocumentSummary {
  return {
    name: doc.name,
    format: doc.format,
    contentType: doc.contentType,
    sha256: doc.sha256,
    lang: doc.lang,
    pages: doc.pages.length,
    tables: doc.pages.reduce((n, p) => n + p.tables.length, 0),
    lines: doc.pages.reduce((n, p) => n + p.lines.length, 0),
    ...(doc.error ? { error: doc.error } : {}),
  };
}

async function readPaths(
  paths: string[],
  fs: FileSystemAdapter,
): Promise<{ files: InputFile[]; errors: { path: string; message: string }[] }> {
  const files: InputFile[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const p of paths) {
    try {
      const abs = fs.resolve(p);
      const st = await fs.stat(abs);
      if (st.kind === 'missing') {
        errors.push({ path: p, message: 'not found' });
        continue;
      }
      const targets =
        st.kind === 'directory'
          ? (await fs.readDir(abs))
              .filter((n) => SUPPORTED.has(n.split('.').pop()?.toLowerCase() ?? ''))
              .sort()
              .map((n) => fs.join(abs, n))
          : [abs];
      for (const t of targets) {
        files.push({ name: fs.basename(t), bytes: await fs.readFile(t) });
      }
    } catch (e) {
      if (e instanceof PathOutsideRootError) errors.push({ path: p, message: e.message });
      else errors.push({ path: p, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { files, errors };
}

export const ingestDocumentsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'ingest_documents',
  title: 'Ingest supplier documents',
  description:
    'Reads PDF, XLSX, CSV, DOCX and TXT documents into a DocumentBundle with page, line, table and cell provenance, deterministically and without OCR or a model. Returns a per-document summary and a bundleId to pass to extract_facts; ask for detail "full" to see the pages. Unsupported or unreadable files are reported, not dropped.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    if (!input.paths?.length && !input.inline?.length) {
      const message = 'Provide paths or inline documents';
      return {
        isError: true,
        structured: { error: message },
        text: { de: 'paths oder inline-Dokumente angeben.', en: message },
      };
    }
    if (input.paths?.length && !ctx.fs) {
      const message =
        'Paths need a file system; this server was started without one. Send inline bytes instead.';
      return {
        isError: true,
        structured: { error: message },
        text: {
          de: 'Pfade brauchen ein Dateisystem; dieser Server wurde ohne eines gestartet. Bytes inline senden.',
          en: message,
        },
      };
    }
    const files: InputFile[] = [];
    const errors: { path: string; message: string }[] = [];
    if (input.paths?.length && ctx.fs) {
      const r = await readPaths(input.paths, ctx.fs);
      files.push(...r.files);
      errors.push(...r.errors);
    }
    for (const doc of input.inline ?? []) {
      try {
        files.push({ name: doc.name, bytes: decodeBase64(doc.base64) });
      } catch (e) {
        errors.push({ path: doc.name, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const bundle: DocumentBundle = await ingest(
      files,
      input.limits ? { limits: input.limits as Record<string, number> } : {},
    );
    const bundleId = await ctx.store.put('bundle', bundle);
    const documents = bundle.documents.map(summarise);
    const lines = (lang: 'de' | 'en') => [
      ...documents.map((d) =>
        d.error
          ? `- ${d.name}: ${lang === 'de' ? 'Fehler' : 'error'} ${d.error.code}: ${d.error.message}`
          : `- ${d.name}: ${d.format}, ${d.pages} ${lang === 'de' ? 'Seiten' : 'pages'}, ${d.tables} ${lang === 'de' ? 'Tabellen' : 'tables'}, ${d.lang}`,
      ),
      ...errors.map((e) => `- ${e.path}: ${e.message}`),
    ];
    return {
      structured: {
        bundleId,
        documents,
        errors,
        ...(input.detail === 'full' ? { bundle } : {}),
      },
      text: {
        de: [
          `${documents.length} Dokument(e) eingelesen, Bundle ${bundleId}.`,
          ...lines('de'),
        ].join('\n'),
        en: [`Ingested ${documents.length} document(s), bundle ${bundleId}.`, ...lines('en')].join(
          '\n',
        ),
      },
    };
  },
};
