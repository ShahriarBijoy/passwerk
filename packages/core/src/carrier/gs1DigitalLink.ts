/**
 * GS1 Digital Link URIs for the data carrier (build plan section 3, kb/carrier.json).
 * Patterns: https://{resolverBase}/01/{gtin14}/21/{serial} and https://{resolverBase}/8004/{giai}.
 * The syntax and the limits are transcribed, not verified against the GS1 standard: the
 * knowledge-base entries carry verify: true. Pure, browser-safe.
 */
import { getCarrierScheme } from '@passwerk/rules';
import { CarrierInputError } from './error.js';

export type Gs1Key = { gtin: string; serial: string } | { giai: string };

const SERIAL_MAX = getCarrierScheme('gs1-digital-link-gtin-serial')?.limits.serialMaxLength ?? 20;
const GIAI_MAX = getCarrierScheme('gs1-digital-link-giai')?.limits.giaiMaxLength ?? 30;
/** Printable ASCII without space; the GS1 character set is a subset (verify). */
const KEY_CHARS = /^[\x21-\x7E ]+$/;

/** Mod-10 check digit for the digits before it: weights 3,1,3,1,... counted from the right. */
export function gtinCheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** GTIN-8, -12, -13 or -14 with a valid check digit, left-padded to 14 digits. */
export function normaliseGtin(gtin: string): string {
  if (!/^\d+$/.test(gtin) || ![8, 12, 13, 14].includes(gtin.length)) {
    throw new CarrierInputError({
      de: `GTIN "${gtin}" muss aus 8, 12, 13 oder 14 Ziffern bestehen.`,
      en: `GTIN "${gtin}" must be 8, 12, 13 or 14 digits.`,
    });
  }
  const body = gtin.slice(0, -1);
  const check = Number(gtin.at(-1));
  if (gtinCheckDigit(body) !== check) {
    throw new CarrierInputError({
      de: `GTIN "${gtin}" hat eine falsche Prüfziffer (erwartet ${gtinCheckDigit(body)}).`,
      en: `GTIN "${gtin}" has a wrong check digit (expected ${gtinCheckDigit(body)}).`,
    });
  }
  return gtin.padStart(14, '0');
}

export function isHttpsUri(s: string): boolean {
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
}

function resolverPrefix(resolverBase: string): string {
  let url: URL;
  try {
    url = new URL(resolverBase);
  } catch {
    throw new CarrierInputError({
      de: `Resolver-Basis "${resolverBase}" ist keine absolute URL.`,
      en: `Resolver base "${resolverBase}" is not an absolute URL.`,
    });
  }
  if (url.protocol !== 'https:' || url.search !== '' || url.hash !== '') {
    throw new CarrierInputError({
      de: `Resolver-Basis "${resolverBase}" muss eine https-URL ohne Query und Fragment sein.`,
      en: `Resolver base "${resolverBase}" must be an https URL without query or fragment.`,
    });
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function checkKey(value: string, label: { de: string; en: string }, max: number): string {
  if (value.length === 0 || value.length > max || !KEY_CHARS.test(value)) {
    throw new CarrierInputError({
      de: `${label.de} muss 1 bis ${max} druckbare ASCII-Zeichen haben.`,
      en: `${label.en} must be 1 to ${max} printable ASCII characters.`,
    });
  }
  return encodeURIComponent(value);
}

export function buildGs1DigitalLink(resolverBase: string, key: Gs1Key): string {
  const prefix = resolverPrefix(resolverBase);
  if ('giai' in key) {
    return `${prefix}/8004/${checkKey(key.giai, { de: 'GIAI', en: 'GIAI' }, GIAI_MAX)}`;
  }
  const gtin = normaliseGtin(key.gtin);
  const serial = checkKey(key.serial, { de: 'Seriennummer', en: 'Serial number' }, SERIAL_MAX);
  return `${prefix}/01/${gtin}/21/${serial}`;
}
