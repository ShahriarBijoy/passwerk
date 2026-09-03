import type { ValueKind } from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import { z } from 'zod';

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const INTEGER_RE = /^-?\d+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** xs:decimal lexical form (no exponent, dot as separator) that decimal.js accepts. */
export function isDecimalString(s: string): boolean {
  if (!DECIMAL_RE.test(s)) return false;
  try {
    return new Decimal(s).isFinite();
  } catch {
    return false;
  }
}

/** RFC 3986 absolute URI (URL or URN): a scheme, a colon, no whitespace. No DOM/Node URL needed. */
const URI_RE = /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/;

function isUri(s: string): boolean {
  return URI_RE.test(s);
}

export const DecimalString = z
  .string()
  .refine(isDecimalString, 'expected a decimal string like "12.5"');
export const IntegerString = z.string().regex(INTEGER_RE, 'expected an integer string like "42"');
export const PercentString = DecimalString.refine((s) => {
  const d = new Decimal(s);
  return d.gte(0) && d.lte(100);
}, 'expected a percentage between 0 and 100');
export const IsoDate = z.string().regex(ISO_DATE_RE, 'expected YYYY-MM-DD');
export const IsoDateTime = z.string().regex(ISO_DATETIME_RE, 'expected an ISO-8601 date-time');
export const Uri = z.string().refine(isUri, 'expected a URL or URN');
export const MultilingualText = z
  .record(z.string().min(2), z.string().min(1))
  .refine((r) => Object.keys(r).length > 0, 'expected at least one language');
export const DocumentRef = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  uri: Uri.optional(),
});
export type DocumentRef = z.infer<typeof DocumentRef>;
export const GraphicRef = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  bytesBase64: z.string().optional(),
  uri: Uri.optional(),
  additionalText: z.string().min(1).optional(),
});
export type GraphicRef = z.infer<typeof GraphicRef>;

const BY_KIND: Record<ValueKind, z.ZodType> = {
  identifier: z.string().min(1),
  text: z.string().min(1),
  uri: Uri,
  multilingualText: MultilingualText,
  decimal: DecimalString,
  percentage: PercentString,
  integer: IntegerString,
  date: IsoDate,
  dateTime: IsoDateTime,
  boolean: z.boolean(),
  enum: z.string().min(1),
  document: z.array(DocumentRef).min(1),
  graphic: GraphicRef,
  composite: z.unknown(),
};

/** The Zod schema for Field.value given the attribute's KB valueKind. */
export function valueSchemaFor(kind: ValueKind): z.ZodType {
  return BY_KIND[kind];
}
