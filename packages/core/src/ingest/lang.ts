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
 * German technical vocabulary, matched as a prefix or suffix of a longer token (never a bare
 * substring): German battery-datasheet text compounds words (e.g. "Nennkapazität",
 * "Batteriemasse") that would never equal a whole-word entry. Only checked against tokens of at
 * least MIN_COMPOUND_LEN characters, so short incidental containment (e.g. an unrelated 5-letter
 * word that happens to contain a 4-letter entry) can't produce a false hit. 'datum' is
 * deliberately excluded: it is also an ordinary English word.
 */
const DE_TECH = [
  'wert',
  'einheit',
  'spannung',
  'kapazität',
  'kapazitaet',
  'masse',
  'gewicht',
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
const MIN_COMPOUND_LEN = 6;

/** English technical vocabulary, matched by exact token equality only (like the stop words): a
 * substring match here produced false positives on ordinary English words that happen to contain
 * one of these as a substring (e.g. "date" inside "update"/"validate", "unit" inside "community",
 * "rated" inside "separated"/"generated", "mass" inside "amass", "range" inside "orange"). */
const EN_TECH = new Set([
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
]);

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
    else if (EN_TECH.has(raw)) en += 1;
    else if (
      raw.length >= MIN_COMPOUND_LEN &&
      DE_TECH.some((w) => raw.startsWith(w) || raw.endsWith(w))
    )
      de += 1;
  }
  return en > de ? 'en' : 'de';
}
