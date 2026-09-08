import {
  canonicalJson,
  emitAasJson,
  emitAasx,
  emitHtml,
  PassportDraftError,
  type Verdict,
} from '@passwerk/core';
import type { LangText } from '../i18n/index.ts';
import type { Derived } from './derive/index.ts';
import { exportDraftJson } from './draftIo.ts';

export interface ExportFile {
  name: string;
  bytes: Uint8Array;
  type: string;
}

export type ExportKind = 'aasJson' | 'aasx' | 'draft' | 'gaps' | 'html' | 'qr';

export type ExportResult =
  | { verdict: Verdict; files: Partial<Record<ExportKind, ExportFile>>; carrierError?: LangText }
  | { error: LangText };

export function slug(passportId: string): string {
  return passportId
    .replace(/^[a-z]+:(\/\/)?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const utf8 = (s: string) => new TextEncoder().encode(s);

export function buildExports(derived: Derived, lang: 'de' | 'en' = 'en'): ExportResult {
  const base = slug(derived.draft.meta.passportId);
  try {
    const json = emitAasJson(derived.draft, { asOf: derived.asOf });
    const aasx = emitAasx(derived.draft, { asOf: derived.asOf });
    const files: Partial<Record<ExportKind, ExportFile>> = {
      aasJson: { name: `${base}.aas.json`, bytes: utf8(json.output), type: 'application/json' },
      aasx: {
        name: `${base}.aasx`,
        bytes: aasx.output,
        type: 'application/asset-administration-shell-package',
      },
      draft: {
        name: `${base}.draft.json`,
        bytes: utf8(exportDraftJson(derived.draft)),
        type: 'application/json',
      },
      gaps: {
        name: `${base}.gaps.json`,
        bytes: utf8(canonicalJson(derived.gap)),
        type: 'application/json',
      },
      html: {
        name: `${base}.html`,
        bytes: utf8(emitHtml(derived.draft, { asOf: derived.asOf, lang }).output),
        type: 'text/html',
      },
    };
    // The QR needs an https identifier; everything else does not (D-035), so a missing carrier
    // omits only the QR file and says why.
    if (derived.carrier.ok) {
      files.qr = {
        name: `${base}.qr.svg`,
        bytes: utf8(derived.carrier.svg),
        type: 'image/svg+xml',
      };
      return { verdict: json.verdict, files };
    }
    return { verdict: json.verdict, files, carrierError: derived.carrier.message };
  } catch (e) {
    if (e instanceof PassportDraftError) {
      const first = e.findings[0];
      return { error: first?.message ?? { de: e.message, en: e.message } };
    }
    throw e;
  }
}
