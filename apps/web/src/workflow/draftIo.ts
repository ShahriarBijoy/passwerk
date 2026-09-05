import { canonicalJson, type PassportDraft, validateSchema } from '@passwerk/core';
import type { LangText } from '../i18n/index.ts';

export type ImportResult = { ok: true; draft: PassportDraft } | { ok: false; message: LangText };

export function importDraftJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: { de: `Kein gültiges JSON: ${detail}`, en: `Not valid JSON: ${detail}` },
    };
  }
  const result = validateSchema(parsed);
  if (!result.draft) {
    const first = result.findings[0];
    return {
      ok: false,
      message: first?.message ?? { de: 'Kein PassportDraft', en: 'Not a PassportDraft' },
    };
  }
  return { ok: true, draft: result.draft };
}

export function exportDraftJson(draft: PassportDraft): string {
  return canonicalJson(draft);
}
