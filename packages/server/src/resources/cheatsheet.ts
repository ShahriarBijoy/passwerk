import {
  BATTERY_CATEGORIES,
  type BatteryCategory,
  getAttributesForCategory,
  getTimeline,
  timeline,
} from '@passwerk/rules';
import type { Lang } from '../types.js';

function categoryLines(lang: Lang): string[] {
  return BATTERY_CATEGORIES.map((c: BatteryCategory) => {
    const mandatory = getAttributesForCategory(c, ['mandatory']).length;
    const conditional = getAttributesForCategory(c, ['conditional']).length;
    return lang === 'de'
      ? `- ${c}: ${mandatory} Pflichtattribute, ${conditional} bedingte`
      : `- ${c}: ${mandatory} mandatory attributes, ${conditional} conditional`;
  });
}

function timelineLines(lang: Lang): string[] {
  return getTimeline()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((e) => {
      const verify = e.verify ? (lang === 'de' ? ' (zu prüfen)' : ' (verify)') : '';
      const alt = e.dateRule === 'latest_of' && e.alternative ? ` / ${e.alternative}` : '';
      return `- ${e.date}${alt}: ${e.title[lang]} (${e.legalRef}; ${e.status}; ${e.appliesTo.join(', ')})${verify}`;
    });
}

function section(lang: Lang): string {
  const h = (de: string, en: string) => (lang === 'de' ? de : en);
  return [
    `## ${h('Deutsch', 'English')}`,
    '',
    `### ${h('Kategorien und Pflichtumfang', 'Categories and mandatory sets')}`,
    ...categoryLines(lang),
    '',
    `### ${h('Termine', 'Key dates')} (${h('Stand', 'as of')} ${timeline.lastVerified ?? ''})`,
    ...timelineLines(lang),
    '',
    `### ${h('Arbeitsablauf', 'Workflow')}`,
    h(
      '1. check_obligations → 2. ingest_documents → 3. extract_facts → 4. suggest_mappings → 5. apply_mappings → 6. validate_passport (Schleife, max. 5) → 7. gap_report → 8. emit_passport',
      '1. check_obligations → 2. ingest_documents → 3. extract_facts → 4. suggest_mappings → 5. apply_mappings → 6. validate_passport (loop, max 5) → 7. gap_report → 8. emit_passport',
    ),
    '',
    `### ${h('Konfidenzregel', 'Confidence rule')}`,
    h(
      'Vorschläge mit Konfidenz >= 0,7 übernehmen; darunter den Nutzer fragen oder die Quellseite lesen. Konflikte nie still überschreiben.',
      'Accept proposals at confidence >= 0.7; below that ask the user or read the source page. Never overwrite a conflict silently.',
    ),
    '',
    `### ${h('Ehrlichkeit', 'Honesty')}`,
    h(
      'Ein Entwurf ist nur "gültig", wenn validate_passport valid oder valid_with_warnings liefert. Keine Rechtsberatung (isNotLegalAdvice: true).',
      'A draft is "valid" only when validate_passport returns valid or valid_with_warnings. Not legal advice (isNotLegalAdvice: true).',
    ),
  ].join('\n');
}

/** Generated from the knowledge base at request time, both languages in one document. */
export function cheatsheet(): string {
  return [
    '# passwerk cheat sheet',
    '',
    'Regulation (EU) 2023/1542, Article 77; IDTA 02035-1 to -7. Generated from the bundled knowledge base.',
    '',
    section('de'),
    '',
    section('en'),
    '',
  ].join('\n');
}
