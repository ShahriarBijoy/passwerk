import type { Attribute, ValueKind } from '@passwerk/rules';
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
export const DocumentClassification = z.object({
  classId: z.string().min(1),
  className: MultilingualText,
  system: z.string().min(1),
});
export type DocumentClassification = z.infer<typeof DocumentClassification>;

export const DocumentRef = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  uri: Uri.optional(),
  classification: DocumentClassification.optional(),
  languages: z
    .array(z.string().regex(/^[a-z]{2}$/))
    .min(1)
    .optional(),
  version: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  contentType: z.string().min(1).optional(),
  domainId: z.string().min(1).optional(),
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

/** The Zod schema for Field.value given only the value kind, with no numeric band applied. */
export function valueSchemaForKind(kind: ValueKind): z.ZodType {
  return BY_KIND[kind];
}

function banded(
  base: z.ZodType<string>,
  range: { min: number | null; max: number | null } | null,
  fallback: { min: number; max: number } | null,
): z.ZodType {
  const min = range?.min ?? fallback?.min ?? null;
  const max = range?.max ?? fallback?.max ?? null;
  if (min === null && max === null) return base;
  const label = `expected a value between ${min ?? '-inf'} and ${max ?? 'inf'}`;
  return base.refine((s: string) => {
    // Zod runs every chained refine even after an earlier one in the chain fails, so guard
    // against a string that already failed the base decimal/integer lexical check: report
    // "true" here and let that earlier check's own issue surface instead of throwing out of
    // `new Decimal`.
    if (!isDecimalString(s)) return true;
    const d = new Decimal(s);
    return (min === null || d.gte(min)) && (max === null || d.lte(max));
  }, label);
}

/**
 * The Zod schema for Field.value given the resolved attribute. Numeric bands come from the
 * knowledge base (ADR D-021), never from a hardcoded constant: `percentage` with no authored
 * range keeps 0..100, everything else uses what the domain expert authored.
 */
export function valueSchemaFor(attribute: Attribute): z.ZodType {
  switch (attribute.valueKind) {
    case 'percentage':
      return banded(DecimalString, attribute.range, { min: 0, max: 100 });
    case 'decimal':
      return banded(DecimalString, attribute.range, null);
    case 'integer':
      return banded(IntegerString, attribute.range, null);
    default:
      return BY_KIND[attribute.valueKind];
  }
}
