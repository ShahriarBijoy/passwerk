/**
 * windows-1252 code points for bytes 0x80-0x9F (the C1 control range where windows-1252
 * diverges from ISO-8859-1/Latin-1); bytes 0x00-0x7F and 0xA0-0xFF map to the same code point
 * in both. Some hosts' built-in `TextDecoder('windows-1252')` decode this range as raw Latin-1
 * control codes instead of the WHATWG-mapped characters, so it is decoded by hand here for a
 * deterministic result across Node and the browser.
 */
const WINDOWS_1252_C1 = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

function decodeWindows1252(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += String.fromCodePoint(b >= 0x80 && b <= 0x9f ? (WINDOWS_1252_C1[b - 0x80] ?? b) : b);
  }
  return out;
}

/** Decode supplier text files: strip a BOM, try strict UTF-8, fall back to windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  let body = bytes;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    body = bytes.subarray(3);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return decodeWindows1252(body);
  }
}
