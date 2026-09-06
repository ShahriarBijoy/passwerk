/**
 * The data carrier (build plan section 2.2, step 8): the passport's unique identifier, an
 * optional GS1 Digital Link, and the QR image. The identifier must be an absolute https URI,
 * the rule PW-PLAUS-008 already applies to the attribute; no new rule id is created.
 */
import { getCarrierScheme, getRule } from '@passwerk/rules';
import { PassportDraftError } from '../emit/aasJson.js';
import { validateSchema } from '../validate/schema.js';
import { CarrierInputError } from './error.js';
import { buildGs1DigitalLink, type Gs1Key, isHttpsUri } from './gs1DigitalLink.js';
import { qrMatrix, renderQrPng, renderQrSvg } from './qr.js';

export type CarrierFormat = 'svg' | 'png';

export interface CarrierInput {
  /** A PassportDraft; its meta.passportId is the identifier. */
  draft?: unknown;
  /** The identifier itself, when no draft is at hand. */
  uid?: string;
  gs1?: Gs1Key;
  /** Required with gs1: the https base of the resolver. */
  resolverBase?: string;
  /** Default svg. */
  format?: CarrierFormat;
}

export interface CarrierResult {
  uid: string;
  digitalLink?: string;
  /** What the QR code encodes: the Digital Link when built, else the identifier. */
  payload: string;
  format: CarrierFormat;
  mediaType: 'image/svg+xml' | 'image/png';
  image: Uint8Array;
  isNotLegalAdvice: true;
  sources: string[];
}

function identifierFrom(input: CarrierInput): string {
  if (input.draft !== undefined && input.uid !== undefined) {
    throw new CarrierInputError({
      de: 'Entweder draft oder uid angeben, nicht beides.',
      en: 'Give either draft or uid, not both.',
    });
  }
  if (input.draft !== undefined) {
    const l1 = validateSchema(input.draft);
    if (!l1.draft) throw new PassportDraftError(l1.findings);
    return l1.draft.meta.passportId;
  }
  if (input.uid === undefined) {
    throw new CarrierInputError({
      de: 'draft oder uid fehlt.',
      en: 'draft or uid is required.',
    });
  }
  return input.uid;
}

export function generateCarrier(input: CarrierInput): CarrierResult {
  const uid = identifierFrom(input);
  if (!isHttpsUri(uid)) {
    throw new CarrierInputError({
      de: `Die Kennung "${uid}" ist keine absolute https-URI (siehe PW-PLAUS-008).`,
      en: `The identifier "${uid}" is not an absolute https URI (see PW-PLAUS-008).`,
    });
  }
  const sources: string[] = [];
  const rule = getRule('PW-PLAUS-008');
  if (rule?.legalRef) sources.push(rule.legalRef);
  let digitalLink: string | undefined;
  if (input.gs1 !== undefined) {
    if (input.resolverBase === undefined) {
      throw new CarrierInputError({
        de: 'resolverBase ist mit gs1 erforderlich.',
        en: 'resolverBase is required with gs1.',
      });
    }
    digitalLink = buildGs1DigitalLink(input.resolverBase, input.gs1);
    const scheme = getCarrierScheme(
      'giai' in input.gs1 ? 'gs1-digital-link-giai' : 'gs1-digital-link-gtin-serial',
    );
    if (scheme) sources.push(scheme.id);
  }
  const payload = digitalLink ?? uid;
  const format = input.format ?? 'svg';
  const matrix = qrMatrix(payload);
  const image =
    format === 'png' ? renderQrPng(matrix) : new TextEncoder().encode(renderQrSvg(matrix));
  return {
    uid,
    ...(digitalLink !== undefined ? { digitalLink } : {}),
    payload,
    format,
    mediaType: format === 'png' ? 'image/png' : 'image/svg+xml',
    image,
    isNotLegalAdvice: true,
    sources,
  };
}
