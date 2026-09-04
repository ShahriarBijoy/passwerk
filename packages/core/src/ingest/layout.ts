export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Segment {
  text: string;
  x0: number;
  x1: number;
}
export interface LayoutLine {
  y: number;
  segments: Segment[];
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
};

/** Cluster by y (tolerance half the median height), sort by x, merge close items into segments. */
export function linesFromItems(items: TextItem[]): LayoutLine[] {
  const words = items.filter((i) => i.str.trim().length > 0);
  if (words.length === 0) return [];
  const tol = Math.max(2, 0.5 * median(words.map((w) => w.height)));
  const charW = median(words.map((w) => w.width / Math.max(1, w.str.length)));
  const sorted = [...words].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: TextItem[][] = [];
  for (const w of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs((last[0] as TextItem).y - w.y) <= tol) last.push(w);
    else groups.push([w]);
  }
  return groups.map((g) => {
    const byX = [...g].sort((a, b) => a.x - b.x);
    const segments: Segment[] = [];
    for (const w of byX) {
      const seg = segments[segments.length - 1];
      const gap = seg ? w.x - seg.x1 : Number.POSITIVE_INFINITY;
      if (seg && gap <= 1.5 * charW) {
        seg.text =
          gap > 0.15 * charW || /\s$/.test(seg.text)
            ? `${seg.text.trimEnd()} ${w.str.trim()}`
            : seg.text + w.str.trim();
        seg.x1 = Math.max(seg.x1, w.x + w.width);
      } else segments.push({ text: w.str.trim(), x0: w.x, x1: w.x + w.width });
    }
    return { y: (g[0] as TextItem).y, segments };
  });
}

const COL_TOL = 8;

/** Runs of >= 2 consecutive lines with >= 2 segments whose segment starts share column positions. */
export function tablesFromLines(
  lines: LayoutLine[],
): { start: number; end: number; columns: number[] }[] {
  const out: { start: number; end: number; columns: number[] }[] = [];
  let start = -1;
  let columns: number[] = [];
  const flush = (end: number) => {
    if (start >= 0 && end - start >= 1)
      out.push({ start, end, columns: [...columns].sort((a, b) => a - b) });
    start = -1;
    columns = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as LayoutLine;
    if (line.segments.length < 2) {
      flush(i - 1);
      continue;
    }
    const starts = line.segments.map((s) => s.x0);
    if (start < 0) {
      start = i;
      columns = starts;
      continue;
    }
    const fits = starts.every((x) => columns.some((c) => Math.abs(c - x) <= COL_TOL));
    if (!fits) {
      flush(i - 1);
      start = i;
      columns = starts;
      continue;
    }
    for (const x of starts) if (!columns.some((c) => Math.abs(c - x) <= COL_TOL)) columns.push(x);
  }
  flush(lines.length - 1);
  return out;
}

/** Assign each segment of a line to the nearest column; empty strings for missing cells. */
export function rowCells(line: LayoutLine, columns: number[]): string[] {
  const cells = columns.map(() => '');
  for (const s of line.segments) {
    let best = 0;
    columns.forEach((c, i) => {
      if (Math.abs(c - s.x0) < Math.abs((columns[best] as number) - s.x0)) best = i;
    });
    cells[best] = cells[best] ? `${cells[best]} ${s.text}` : s.text;
  }
  return cells;
}
