import type { Lang } from '../ingest/types.js';
import { isDecimalString } from '../model/values.js';

const NUMERIC = /^[-+]?[\d.,\s  ]+$/;

export function parseNumber(
  raw: string,
  lang: Lang,
): { value: string; kind: 'decimal' | 'integer' } | undefined {
  const trimmed = raw.trim();
  if (!NUMERIC.test(trimmed) || !/\d/.test(trimmed)) return undefined;
  let s = trimmed.replace(/[\s  ]/g, '');
  const sign = s.startsWith('-') ? '-' : '';
  s = s.replace(/^[-+]/, '');
  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (commas > 0 && dots > 0) {
    const decimalSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thousands = decimalSep === ',' ? '.' : ',';
    if ((s.match(new RegExp(`\\${decimalSep}`, 'g')) ?? []).length !== 1) return undefined;
    const sepIndex = s.lastIndexOf(decimalSep);
    const integerPart = s.slice(0, sepIndex);
    const decimalPart = s.slice(sepIndex + 1);
    if (integerPart.includes(thousands)) {
      const groups = integerPart.split(thousands);
      const wellGrouped =
        (groups[0]?.length ?? 0) >= 1 &&
        (groups[0]?.length ?? 0) <= 3 &&
        groups.slice(1).every((g) => g.length === 3);
      if (!wellGrouped) return undefined;
    }
    s = `${integerPart.split(thousands).join('')}.${decimalPart}`;
  } else if (commas > 1) s = s.split(',').join('');
  else if (dots > 1) s = s.split('.').join('');
  else if (commas === 1) {
    const after = s.split(',')[1] as string;
    s = lang === 'en' && after.length === 3 ? s.replace(',', '') : s.replace(',', '.');
  } else if (dots === 1) {
    const after = s.split('.')[1] as string;
    if (lang === 'de' && after.length === 3) s = s.replace('.', '');
  }
  if (!isDecimalString(s)) return undefined;
  const value = `${sign}${s}`;
  return { value, kind: value.includes('.') ? 'decimal' : 'integer' };
}
