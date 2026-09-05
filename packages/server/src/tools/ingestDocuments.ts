import { type DocumentBundle, type IngestedDocument, type InputFile, ingest } from '@passwerk/core';
import { z } from 'zod';
import { decodeBase64 } from '../base64.js';
import { type FileSystemAdapter, out, type ToolDefinition } from '../types.js';

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

type PathError = { path: string; message: string };

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Reads files and directories through the adapter. Each child of a directory is handled on
 * its own (a read failure or a subdirectory named like a file drops that child only), and
 * every document is named by its root-relative path so same-named files in different
 * directories stay distinct (PR #25 review, P2).
 */
async function readPaths(
  paths: string[],
  fs: FileSystemAdapter,
): Promise<{ files: InputFile[]; errors: PathError[] }> {
  const files: InputFile[] = [];
  const errors: PathError[] = [];
  const readOne = async (target: string, shown: string): Promise<void> => {
    try {
      files.push({ name: fs.relative(target), bytes: await fs.readFile(target) });
    } catch (e) {
      errors.push({ path: shown, message: errorMessage(e) });
    }
  };
  for (const p of paths) {
    let abs: string;
    let kind: 'file' | 'directory' | 'missing';
    try {
      abs = fs.resolve(p);
      kind = (await fs.stat(abs)).kind;
    } catch (e) {
      errors.push({ path: p, message: errorMessage(e) });
      continue;
    }
    if (kind === 'missing') {
      errors.push({ path: p, message: 'not found' });
      continue;
    }
    if (kind === 'file') {
      await readOne(abs, p);
      continue;
    }
    let names: string[];
    try {
      names = (await fs.readDir(abs))
        .filter((n) => SUPPORTED.has(n.split('.').pop()?.toLowerCase() ?? ''))
        .sort();
    } catch (e) {
      errors.push({ path: p, message: errorMessage(e) });
      continue;
    }
    for (const n of names) {
      const child = fs.join(abs, n);
      const shown = `${p.replace(/[/]+$/, '')}/${n}`;
      try {
        if ((await fs.stat(child)).kind !== 'file') continue;
      } catch (e) {
        errors.push({ path: shown, message: errorMessage(e) });
        continue;
      }
      await readOne(child, shown);
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
    const collected: InputFile[] = [];
    const errors: PathError[] = [];
    if (input.paths?.length && ctx.fs) {
      const r = await readPaths(input.paths, ctx.fs);
      collected.push(...r.files);
      errors.push(...r.errors);
    }
    for (const doc of input.inline ?? []) {
      try {
        collected.push({ name: doc.name, bytes: decodeBase64(doc.base64) });
      } catch (e) {
        errors.push({ path: doc.name, message: errorMessage(e) });
      }
    }
    // Core keys fact ids and provenance on the name: a second document with the same name
    // would be indistinguishable, so it is reported and skipped.
    const seen = new Set<string>();
    const files: InputFile[] = [];
    for (const f of collected) {
      if (seen.has(f.name)) {
        errors.push({ path: f.name, message: 'duplicate document name; skipped' });
        continue;
      }
      seen.add(f.name);
      files.push(f);
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
