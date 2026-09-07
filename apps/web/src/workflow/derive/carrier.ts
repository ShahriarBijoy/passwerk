import { CarrierInputError, generateCarrier } from '@passwerk/core';
import type { LangText } from '../../i18n/index.ts';
import { memoLast } from './memo.ts';

export type CarrierView =
  | { ok: true; svg: string; payload: string }
  | { ok: false; message: LangText };

/** The QR for an identifier, or core's DE/EN reason there is none (D-035: never blocks anything). */
export const deriveCarrier = memoLast((passportId: string): CarrierView => {
  try {
    const r = generateCarrier({ uid: passportId, format: 'svg' });
    return { ok: true, svg: new TextDecoder().decode(r.image), payload: r.payload };
  } catch (e) {
    if (e instanceof CarrierInputError) return { ok: false, message: e.text };
    throw e;
  }
});
