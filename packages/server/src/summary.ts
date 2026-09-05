import type { Finding, GapReport, ValidationReport } from '@passwerk/core';
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

export function gapSummary(gap: GapReport): LangText {
  const open = gap.items.filter((i) => i.bucket === 'required' && i.status !== 'present');
  const m = gap.completeness.mandatory;
  const o = gap.completeness.overall;
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
    de: [
      `Pflichtangaben ${m.present}/${m.total} (${m.percent} %), gesamt ${o.present}/${o.total} (${o.percent} %). Offene Pflichtangaben: ${open.length}. Keine Rechtsberatung.`,
      ...lines('de'),
    ].join('\n'),
    en: [
      `Mandatory ${m.present}/${m.total} (${m.percent} %), overall ${o.present}/${o.total} (${o.percent} %). Open mandatory: ${open.length}. Not legal advice.`,
      ...lines('en'),
    ].join('\n'),
  };
}
