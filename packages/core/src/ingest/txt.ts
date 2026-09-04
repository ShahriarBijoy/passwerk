import { detectLang } from './lang.js';
import { decodeText } from './text.js';
import type { InputFile, Line, Page } from './types.js';

/** Column-like segments: split on a tab or on two or more spaces. */
export function segmentsOf(text: string): string[] {
  return text
    .split(/\t| {2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function readTxt(file: InputFile): Page[] {
  const text = decodeText(file.bytes);
  const lines: Line[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    lines.push({
      text: trimmed,
      segments: segmentsOf(trimmed),
      source: { file: file.name, page: 1, note: `line ${i + 1}` },
    });
  });
  return [{ number: 1, lang: detectLang(text), textless: lines.length === 0, lines, tables: [] }];
}
