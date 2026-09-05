import {
  type ApplicabilityStatus,
  type BatteryCategory,
  getTemplate,
  attributes as knowledgeBaseAttributes,
  type LangText,
} from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import { byCodePoint } from '../mapping/propose.js';
import type { AnyFieldValue } from '../model/field.js';
import { getField, type PassportDraft } from '../model/passport.js';
import type { Provenance } from '../model/provenance.js';
import type { ValidationReport } from '../validate/finding.js';
import { type GapBucket, type GapStatus, suggestedAction } from './action.js';

export type { GapBucket, GapStatus } from './action.js';

export interface Completeness {
  present: number;
  total: number;
  /** Decimal string with one fractional digit, e.g. "72.3". Computed with decimal.js. */
  percent: string;
}

export interface GapItem {
  attributeId: string;
  name: LangText;
  status: GapStatus;
  bucket: GapBucket;
  applicability: ApplicabilityStatus;
  applicabilityText?: string;
  part: number | null;
  submodelIdShort: string | null;
  legalRefs: string[];
  whoTypicallyHasIt: LangText;
  explanation: LangText;
  suggestedAction: LangText;
  sources: Provenance[];
  confidence?: number;
  /** Rule ids from the passed report that name this attribute. */
  findings: string[];
  verify: boolean;
}

export interface GapReport {
  category: BatteryCategory;
  asOf: string;
  completeness: { mandatory: Completeness; overall: Completeness };
  items: GapItem[];
  bySubmodel: {
    part: number | null;
    submodelIdShort: string | null;
    completeness: Completeness;
    attributeIds: string[];
  }[];
  byDataOwner: { owner: LangText; attributeIds: string[] }[];
  isNotLegalAdvice: true;
  sources: string[];
}

export interface GapReportOptions {
  /** A ValidationReport for the same draft; supplies the invalid status and finding ids. */
  report?: ValidationReport;
  /** ISO date-time treated as "now". Default: draft.meta.createdAt. */
  asOf?: string;
}

const BUCKETS: Record<ApplicabilityStatus, GapBucket> = {
  mandatory: 'required',
  conditional: 'conditional',
  optional: 'optional',
  // Never reported as a gap (ADR D-008).
  not_yet_applicable: 'deferred',
  not_displayed: 'deferred',
};

function completeness(present: number, total: number): Completeness {
  const percent =
    total === 0
      ? new Decimal(0)
      : new Decimal(present).div(total).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  return { present, total, percent: percent.toFixed(1) };
}

function statusOf(field: AnyFieldValue | undefined, hasError: boolean): GapStatus {
  if (hasError) return 'invalid';
  if (field?.status === 'conflict') return 'conflict';
  if (field?.status === 'not_applicable') return 'not_applicable';
  if (field?.status === 'present') return 'present';
  return 'missing';
}

/**
 * The to-do list: every knowledge-base attribute for this battery's category, with what it
 * is, who typically holds it, what the law says and what to do next. Not legal advice.
 */
export function gapReport(draft: PassportDraft, options: GapReportOptions = {}): GapReport {
  const category = draft.meta.category;
  const findingsByAttribute = new Map<string, { ids: string[]; error: boolean }>();
  for (const finding of options.report?.findings ?? []) {
    if (!finding.attributeId) continue;
    const entry = findingsByAttribute.get(finding.attributeId) ?? { ids: [], error: false };
    entry.ids.push(finding.ruleId);
    entry.error ||= finding.severity === 'error';
    findingsByAttribute.set(finding.attributeId, entry);
  }

  const items: GapItem[] = knowledgeBaseAttributes.map((attribute) => {
    const cell = attribute.applicability[category];
    const bucket = BUCKETS[cell.status];
    const field = getField(draft, attribute.id);
    const found = findingsByAttribute.get(attribute.id);
    const status = statusOf(field, found?.error ?? false);
    const submodel = attribute.part === null ? null : getTemplate(attribute.part);
    return {
      attributeId: attribute.id,
      name: attribute.name,
      status,
      bucket,
      applicability: cell.status,
      ...(cell.text ? { applicabilityText: cell.text } : {}),
      part: attribute.part,
      submodelIdShort: submodel?.submodelIdShort ?? null,
      legalRefs: attribute.legalRefs,
      whoTypicallyHasIt: attribute.whoTypicallyHasIt,
      explanation: attribute.explanation,
      suggestedAction: suggestedAction(status, bucket, cell.status, attribute.whoTypicallyHasIt),
      sources: field?.source ?? [],
      ...(field?.confidence !== undefined ? { confidence: field.confidence } : {}),
      findings: [...(found?.ids ?? [])].sort(),
      verify: attribute.verify,
    };
  });

  const counted = (buckets: GapBucket[]): Completeness => {
    const relevant = items.filter((i) => buckets.includes(i.bucket));
    return completeness(relevant.filter((i) => i.status === 'present').length, relevant.length);
  };

  const submodelKeys = [...new Set(items.map((i) => i.part))].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
  const bySubmodel = submodelKeys.map((part) => {
    const group = items.filter((i) => i.part === part);
    const relevant = group.filter((i) => i.bucket === 'required' || i.bucket === 'conditional');
    return {
      part,
      submodelIdShort: group[0]?.submodelIdShort ?? null,
      completeness: completeness(
        relevant.filter((i) => i.status === 'present').length,
        relevant.length,
      ),
      attributeIds: group.map((i) => i.attributeId),
    };
  });

  const owners = new Map<string, { owner: LangText; attributeIds: string[] }>();
  for (const item of items) {
    const key = item.whoTypicallyHasIt.en;
    const entry = owners.get(key) ?? { owner: item.whoTypicallyHasIt, attributeIds: [] };
    entry.attributeIds.push(item.attributeId);
    owners.set(key, entry);
  }
  const byDataOwner = [...owners.entries()]
    .sort(([a], [b]) => byCodePoint(a, b))
    .map(([, value]) => value);

  return {
    category,
    asOf: options.asOf ?? draft.meta.createdAt,
    completeness: {
      mandatory: counted(['required']),
      overall: counted(['required', 'conditional']),
    },
    items,
    bySubmodel,
    byDataOwner,
    isNotLegalAdvice: true,
    sources: [
      'Regulation (EU) 2023/1542, Annex XIII and Annex VI Part A',
      "European Commission, Guidance Document 'Digital Batteries Passport - data points by category', version 2.0",
      'DIN DKE SPEC 99100',
      'IDTA 02035-1 to -7',
    ],
  };
}
