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

/**
 * Technical vocabulary, checked as a substring of each token rather than an exact match:
 * German battery-datasheet text is full of compounds (e.g. "Nennkapazität", "Batteriemasse")
 * that would never equal a whole-word entry. A word from either list occurring inside a token
 * counts once for that language, same as a stop word.
 */
const DE_TECH = [
  'wert',
  'einheit',
  'spannung',
  'kapazität',
  'kapazitaet',
  'masse',
  'gewicht',
  'datum',
  'hersteller',
  'nenn',
  'bereich',
  'untere',
  'obere',
  'lebensdauer',
  'energie',
  'kenngröße',
  'kenngroesse',
  'zyklen',
];
const EN_TECH = [
  'rated',
  'capacity',
  'value',
  'unit',
  'temperature',
  'cycles',
  'voltage',
  'mass',
  'weight',
  'date',
  'manufacturer',
  'nominal',
  'range',
  'lower',
  'upper',
  'life',
  'energy',
  'parameter',
];

/**
 * DE or EN by stop-word and technical-vocabulary counts; 'de' on a tie (the primary market).
 * The tie-break only applies to genuinely ambiguous text (e.g. "94,5 Ah" has no stop words and
 * no technical vocabulary hit in either language).
 */
export function detectLang(text: string): Lang {
  let de = 0;
  let en = 0;
  for (const raw of text.toLowerCase().split(/[^a-zäöüß]+/)) {
    if (raw.length === 0) continue;
    if (DE.has(raw)) de += 1;
    else if (EN.has(raw)) en += 1;
    else if (DE_TECH.some((w) => raw.includes(w))) de += 1;
    else if (EN_TECH.some((w) => raw.includes(w))) en += 1;
  }
  return en > de ? 'en' : 'de';
}
