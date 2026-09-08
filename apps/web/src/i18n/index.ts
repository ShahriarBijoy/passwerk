import { de } from './de.ts';
import { en } from './en.ts';

export type Language = 'de' | 'en';
export type Key = keyof typeof de;
export type LangText = { de: string; en: string };

const DICT: Record<Language, Record<Key, string>> = { de, en };

export function t(lang: Language, key: Key, params: Record<string, string | number> = {}): string {
  // A missing template (a key cast from data) renders as the key rather than throwing mid-render.
  const template = DICT[lang][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function pick(lang: Language, text: LangText): string {
  return text[lang];
}

export function verdictKey(verdict: 'valid' | 'valid_with_warnings' | 'invalid'): Key {
  return `gaps.verdict.${verdict}`;
}

/** '1 row' / '1 Zeile' for a single row, `rows.count` otherwise. */
export function rowsCount(lang: Language, count: number): string {
  return count === 1 ? t(lang, 'rows.count.one') : t(lang, 'rows.count', { count });
}

/** '1 of 3 facts' / singular '3 of 1 fact' when the total is exactly one. */
export function factsCount(lang: Language, shown: number, total: number): string {
  return total === 1
    ? t(lang, 'facts.count.one', { shown })
    : t(lang, 'facts.count', { shown, total });
}

/** 'Continue to facts (1 proposal)' singular, `upload.continue` otherwise. */
export function uploadContinueLabel(lang: Language, count: number): string {
  return count === 1 ? t(lang, 'upload.continue.one') : t(lang, 'upload.continue', { count });
}
