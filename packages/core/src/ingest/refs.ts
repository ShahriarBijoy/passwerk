/** Column letters for a 1-based column index: 1 -> A, 27 -> AA. */
export function columnLetters(col: number): string {
  let n = col;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function a1(row: number, col: number): string {
  return `${columnLetters(col)}${row}`;
}

/** Parse "B7" into { row: 7, col: 2 }. */
export function parseA1(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`@passwerk/core: bad cell reference ${ref}`);
  let col = 0;
  for (const ch of m[1] as string) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}

export function rcRef(row: number, col: number): string {
  return `R${row}C${col}`;
}

export function tableRef(table: number, row: number, col: number): string {
  return `T${table}:${rcRef(row, col)}`;
}
