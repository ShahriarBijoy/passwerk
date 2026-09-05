import {
  canonicalJson,
  emitAasJson,
  emitAasx,
  PassportDraftError,
  type Verdict,
} from '@passwerk/core';
import type { LangText } from '../i18n/index.ts';
import type { Derived } from './derive.ts';
import { exportDraftJson } from './draftIo.ts';

export interface ExportFile {
  name: string;
  bytes: Uint8Array;
  type: string;
}

export function slug(passportId: string): string {
  return passportId
    .replace(/^[a-z]+:(\/\/)?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const utf8 = (s: string) => new TextEncoder().encode(s);

export function buildExports(
  derived: Derived,
): { files: ExportFile[]; verdict: Verdict } | { error: LangText } {
  const base = slug(derived.draft.meta.passportId);
  try {
    const json = emitAasJson(derived.draft, { asOf: derived.asOf });
    const aasx = emitAasx(derived.draft, { asOf: derived.asOf });
    return {
      verdict: json.verdict,
      files: [
        { name: `${base}.aas.json`, bytes: utf8(json.output), type: 'application/json' },
        {
          name: `${base}.aasx`,
          bytes: aasx.output,
          type: 'application/asset-administration-shell-package',
        },
        {
          name: `${base}.draft.json`,
          bytes: utf8(exportDraftJson(derived.draft)),
          type: 'application/json',
        },
        {
          name: `${base}.gaps.json`,
          bytes: utf8(canonicalJson(derived.gap)),
          type: 'application/json',
        },
      ],
    };
  } catch (e) {
    if (e instanceof PassportDraftError) {
      const first = e.findings[0];
      return { error: first?.message ?? { de: e.message, en: e.message } };
    }
    throw e;
  }
}
