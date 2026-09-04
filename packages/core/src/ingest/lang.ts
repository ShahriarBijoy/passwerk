import type { Lang } from './types.js';

const DE = new Set([
  'der',
  'die',
  'das',
  'und',
  'nicht',
  'mit',
  'für',
  'fuer',
  'von',
  'ist',
  'des',
  'dem',
  'ein',
  'eine',
  'bei',
  'nach',
  'zum',
  'zur',
]);
const EN = new Set([
  'the',
  'and',
  'of',
  'for',
  'with',
  'is',
  'to',
  'in',
  'on',
  'by',
  'at',
  'from',
  'this',
  'that',
]);

/** DE or EN by stop-word counts; 'de' on a tie (the primary market). */
export function detectLang(text: string): Lang {
  let de = 0;
  let en = 0;
  for (const raw of text.toLowerCase().split(/[^a-zäöüß]+/)) {
    if (DE.has(raw)) de += 1;
    else if (EN.has(raw)) en += 1;
  }
  return en > de ? 'en' : 'de';
}
