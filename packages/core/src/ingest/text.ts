/** Decode supplier text files: strip a BOM, try strict UTF-8, fall back to windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  let body = bytes;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    body = bytes.subarray(3);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return new TextDecoder('windows-1252').decode(body);
  }
}
