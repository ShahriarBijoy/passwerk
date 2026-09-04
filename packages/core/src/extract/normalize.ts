const STOP = new Set([
  'der',
  'die',
  'das',
  'des',
  'dem',
  'den',
  'ein',
  'eine',
  'the',
  'a',
  'an',
  'of',
  'in',
  'von',
  'im',
  'and',
  'und',
  'für',
  'fuer',
  'for',
  'pro',
  'per',
]);

/** Unicode combining diacritical marks block (0x0300-0x036f), left behind by NFKD decomposition. */
function stripCombiningMarks(s: string): string {
  return Array.from(s)
    .filter((ch) => {
      const code = ch.codePointAt(0) as number;
      return code < 0x0300 || code > 0x036f;
    })
    .join('');
}

/** Lower-case, ASCII-fold umlauts, drop bracketed unit suffixes and trailing colon, keep alphanumerics, drop stop words. */
export function normalizeLabel(label: string): string {
  const folded = stripCombiningMarks(
    label
      .toLowerCase()
      .replace(/[[(][^\])]*[\])]/g, ' ')
      .replace(/\s*%\s*$/, ' ')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD'),
  ).replace(/[^a-z0-9]+/g, ' ');
  return folded
    .split(' ')
    .filter((t) => t.length > 0 && !STOP.has(t))
    .join(' ');
}

export function tokens(key: string): string[] {
  return key.length === 0 ? [] : key.split(' ');
}
