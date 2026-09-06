import {
  canonicalJson,
  emitAasJson,
  emitAasx,
  emitHtml,
  type Finding,
  type Verdict,
  validate,
} from '@passwerk/core';
import { z } from 'zod';
import { encodeBase64 } from '../base64.js';
import { DraftRef, resolveDraft } from '../refs.js';
import { FindingSchema, out, type ToolDefinition } from '../types.js';

export const EMIT_TARGETS = ['aas-json', 'aasx', 'draft-json', 'html'] as const;
export type EmitTarget = (typeof EMIT_TARGETS)[number];

const inputSchema = {
  draft: DraftRef,
  targets: z
    .array(z.enum(EMIT_TARGETS))
    .min(1)
    .describe(
      'aas-json: AAS v3 JSON environment (IDTA 02035); aasx: AASX package; draft-json: the neutral PassportDraft; html: self-contained HTML passport sheet (DE and EN inside)',
    ),
  outDir: z
    .string()
    .optional()
    .describe('Directory to write into (needs a file system). Omit to receive base64 bytes inline'),
  asOf: z.string().optional().describe('ISO date-time treated as "now" by the re-validation'),
  htmlLang: z
    .enum(['de', 'en'])
    .optional()
    .describe('Language the html sheet opens in (both are in the file; default en)'),
};

const outputSchema = out({
  draftId: z.string().optional(),
  verdict: z.enum(['valid', 'valid_with_warnings', 'invalid']).optional(),
  findings: z.array(FindingSchema).optional(),
  files: z
    .array(
      z.object({
        target: z.enum(EMIT_TARGETS),
        name: z.string(),
        size: z.number(),
        path: z.string().optional(),
        bytes: z.string().optional().describe('base64'),
      }),
    )
    .optional(),
});

/** Same rule as the web app: passportId without scheme, lower case, safe characters only. */
export function slug(passportId: string): string {
  return passportId
    .replace(/^[a-z]+:(\/\/)?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export const emitPassportTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'emit_passport',
  title: 'Emit the passport files',
  description:
    'Emits a PassportDraft as AAS JSON (IDTA 02035 submodels), an AASX package, the draft JSON and/or the HTML sheet, and re-validates the emitted output. Fail-honest: files are returned even when the verdict is invalid, and the verdict is never better than validate_passport’s. Bytes come back base64 inline unless outDir is given.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    if (input.outDir !== undefined && !ctx.fs) {
      const message =
        'File output needs a file system; this server was started without one. Omit outDir to receive bytes inline.';
      return {
        isError: true,
        structured: { error: message },
        text: {
          de: 'Dateiausgabe braucht ein Dateisystem; dieser Server wurde ohne eines gestartet. outDir weglassen, um die Bytes inline zu erhalten.',
          en: message,
        },
      };
    }
    const { draft, draftId } = await resolveDraft(input.draft, ctx);
    const opts = input.asOf !== undefined ? { asOf: input.asOf } : {};
    const base = slug(draft.meta.passportId);
    const outputs: { target: EmitTarget; name: string; bytes: Uint8Array }[] = [];
    let verdict: Verdict | undefined;
    let findings: Finding[] | undefined;
    for (const target of input.targets) {
      if (target === 'aas-json') {
        const r = emitAasJson(draft, opts);
        verdict ??= r.verdict;
        findings ??= r.findings;
        outputs.push({ target, name: `${base}.aas.json`, bytes: utf8(r.output) });
      } else if (target === 'aasx') {
        const r = emitAasx(draft, opts);
        verdict ??= r.verdict;
        findings ??= r.findings;
        outputs.push({ target, name: `${base}.aasx`, bytes: r.output });
      } else if (target === 'html') {
        const r = emitHtml(draft, { ...opts, lang: input.htmlLang ?? 'en' });
        verdict ??= r.verdict;
        findings ??= r.findings;
        outputs.push({ target, name: `${base}.html`, bytes: utf8(r.output) });
      } else {
        outputs.push({ target, name: `${base}.draft.json`, bytes: utf8(canonicalJson(draft)) });
      }
    }
    if (verdict === undefined || findings === undefined) {
      const report = validate(draft, opts);
      verdict = report.verdict;
      findings = report.findings;
    }
    const files: {
      target: EmitTarget;
      name: string;
      size: number;
      path?: string;
      bytes?: string;
    }[] = [];
    for (const o of outputs) {
      if (input.outDir !== undefined && ctx.fs) {
        const path = ctx.fs.join(ctx.fs.resolve(input.outDir), o.name);
        await ctx.fs.writeFile(path, o.bytes);
        files.push({ target: o.target, name: o.name, size: o.bytes.length, path });
      } else {
        files.push({
          target: o.target,
          name: o.name,
          size: o.bytes.length,
          bytes: encodeBase64(o.bytes),
        });
      }
    }
    const names = files.map((f) => f.path ?? f.name).join(', ');
    const wrote = input.outDir !== undefined;
    return {
      structured: { draftId, verdict, findings, files },
      text: {
        de: `Ergebnis der Nachvalidierung: ${verdict}. ${wrote ? 'Geschrieben' : 'Zurückgegeben'}: ${files.length} Datei(en): ${names}.`,
        en: `Re-validation verdict: ${verdict}. ${wrote ? 'Wrote' : 'Returned'} ${files.length} file(s): ${names}.`,
      },
    };
  },
};
