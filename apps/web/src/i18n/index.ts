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
