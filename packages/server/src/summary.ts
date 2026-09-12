import type { Finding, GapItem, GapReport, ValidationReport } from '@passwerk/core';
import type { LangText } from './types.js';

const MAX_LINES = 10;

function count(findings: readonly Finding[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === 'error') errors++;
    else warnings++;
  }
  return { errors, warnings };
}

function findingLines(findings: readonly Finding[], lang: 'de' | 'en'): string[] {
  const lines = findings
    .slice(0, MAX_LINES)
    .map((f) => `- [${f.layer}] ${f.ruleId} ${f.path}: ${f.message[lang]}`);
  if (findings.length > MAX_LINES) {
    lines.push(
      lang === 'de'
        ? `- … ${findings.length - MAX_LINES} weitere`
        : `- … ${findings.length - MAX_LINES} more`,
    );
  }
  return lines;
}

export function validationSummary(report: ValidationReport): LangText {
  const { errors, warnings } = count(report.findings);
  return {
    de: [
      `Ergebnis: ${report.verdict}. ${errors} Fehler, ${warnings} Warnungen.`,
      ...findingLines(report.findings, 'de'),
    ].join('\n'),
    en: [
      `Verdict: ${report.verdict}. ${errors} errors, ${warnings} warnings.`,
      ...findingLines(report.findings, 'en'),
    ].join('\n'),
  };
}

export interface GapSummaryOptions {
  /**
   * The items to show in the text, already filtered by the caller (status/bucket). Default:
   * `gap.items`, unfiltered — this is what keeps the summary byte-identical to before D-042
   * when no `detail` or filter is given.
   */
  items?: readonly GapItem[];
  /** `full`: every item, grouped by data owner, no cap. Default: `summary`, capped at 10. */
  detail?: 'summary' | 'full';
  /**
   * Set when a status/bucket filter was applied, so the text can say the completeness figures
   * still describe the whole passport (ADR D-042).
   */
  filtered?: boolean;
}

function completenessLines(gap: GapReport, filtered: boolean, lang: 'de' | 'en'): string {
  const open = gap.items.filter((i) => i.bucket === 'required' && i.status !== 'present');
  const m = gap.completeness.mandatory;
  const o = gap.completeness.overall;
  const note = filtered
    ? lang === 'de'
      ? ' Diese Werte gelten für den gesamten Pass, nicht für diesen Filter.'
      : ' These figures cover the whole passport, not this filter.'
    : '';
  return lang === 'de'
    ? `Pflichtangaben ${m.present}/${m.total} (${m.percent} %), gesamt ${o.present}/${o.total} (${o.percent} %). Offene Pflichtangaben: ${open.length}. Keine Rechtsberatung.${note}`
    : `Mandatory ${m.present}/${m.total} (${m.percent} %), overall ${o.present}/${o.total} (${o.percent} %). Open mandatory: ${open.length}. Not legal advice.${note}`;
}

function gapSummarySimple(gap: GapReport, items: readonly GapItem[], filtered: boolean): LangText {
  const open = filtered
    ? items
    : items.filter((i) => i.bucket === 'required' && i.status !== 'present');
  const lines = (lang: 'de' | 'en') => {
    const out = open
      .slice(0, MAX_LINES)
      .map((i) => `- ${i.attributeId} (${i.name[lang]}): ${i.whoTypicallyHasIt[lang]}`);
    if (open.length > MAX_LINES) {
      out.push(
        lang === 'de'
          ? `- … ${open.length - MAX_LINES} weitere`
          : `- … ${open.length - MAX_LINES} more`,
      );
    }
    return out;
  };
  return {
    de: [completenessLines(gap, filtered, 'de'), ...lines('de')].join('\n'),
    en: [completenessLines(gap, filtered, 'en'), ...lines('en')].join('\n'),
  };
}

function ownerLines(gap: GapReport, items: readonly GapItem[], lang: 'de' | 'en'): string[] {
  const byId = new Map(items.map((i) => [i.attributeId, i] as const));
  const lines: string[] = [];
  for (const group of gap.byDataOwner) {
    const groupItems = group.attributeIds
      .map((id) => byId.get(id))
      .filter((i): i is GapItem => i !== undefined);
    if (groupItems.length === 0) continue;
    lines.push(`${group.owner[lang]}:`);
    for (const item of groupItems) {
      lines.push(
        `- ${item.attributeId} — ${item.name[lang]} · ${item.status} · ${item.bucket} · ${item.legalRefs.join(', ')} · ${item.suggestedAction[lang]}`,
      );
    }
  }
  return lines;
}

function gapSummaryFull(gap: GapReport, items: readonly GapItem[], filtered: boolean): LangText {
  return {
    de: [...ownerLines(gap, items, 'de'), completenessLines(gap, filtered, 'de')].join('\n'),
    en: [...ownerLines(gap, items, 'en'), completenessLines(gap, filtered, 'en')].join('\n'),
  };
}

/**
 * The gap report as text. Default (no options): byte-identical to the pre-D-042 output — open
 * mandatory items, capped at {@link MAX_LINES}. `detail: 'full'` lists every `items` entry,
 * grouped by data owner, with status, bucket, legal refs and next action, no cap. A `status` or
 * `bucket` filter narrows `items` and the text notes that completeness stays unfiltered.
 */
export function gapSummary(gap: GapReport, options: GapSummaryOptions = {}): LangText {
  const items = options.items ?? gap.items;
  const filtered = options.filtered ?? false;
  return options.detail === 'full'
    ? gapSummaryFull(gap, items, filtered)
    : gapSummarySimple(gap, items, filtered);
}
