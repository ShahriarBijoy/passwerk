/** Semicolon CSV in windows-1252 with LF endings, as exported by a German Excel. */
export function writeCsv1252(rows: string[][]): Uint8Array {
  const text = rows
    .map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';'))
    .join('\n');
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.charCodeAt(i);
    if (cp < 0x80) out[i] = cp;
    else if (cp === 0xb0)
      out[i] = 0xb0; // °
    else if (cp === 0x2013)
      out[i] = 0x96; // en dash
    else if (cp === 0xe4)
      out[i] = 0xe4; // ä
    else if (cp === 0xf6)
      out[i] = 0xf6; // ö
    else if (cp === 0xfc)
      out[i] = 0xfc; // ü
    else if (cp === 0xdf)
      out[i] = 0xdf; // ß
    else throw new Error(`writeCsv1252: no windows-1252 byte for U+${cp.toString(16)}`);
  }
  return out;
}
