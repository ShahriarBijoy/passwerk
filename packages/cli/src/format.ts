/** Text rendering and the small helpers every command shares. */
import { canonicalJson, type Finding, type Verdict } from '@passwerk/core';
import type { Command } from 'commander';
import { CliInputError, type CliIo, type Lang } from './io.js';

export function verdictExit(verdict: Verdict): number {
  return verdict === 'valid' ? 0 : verdict === 'valid_with_warnings' ? 1 : 2;
}

export function pick(text: { de: string; en: string }, lang: Lang): string {
  return lang === 'de' ? text.de : text.en;
}

export async function readJsonFile(io: CliIo, path: string): Promise<unknown> {
  let bytes: Uint8Array;
  try {
    bytes = await io.fs.readFile(path);
  } catch (e) {
    throw new CliInputError(`Cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new CliInputError(`${path} is not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function printJson(io: CliIo, value: unknown): void {
  io.stdout.write(canonicalJson(value));
}

/** Output failures are usage errors (exit 3), like unreadable input (PR #26 review). */
export async function writeOut(io: CliIo, path: string, bytes: Uint8Array): Promise<string> {
  try {
    const target = io.fs.resolve(path);
    await io.fs.writeFile(target, bytes);
    return target;
  } catch (e) {
    throw new CliInputError(`Cannot write ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function countBySeverity(findings: readonly Finding[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === 'error') errors++;
    else warnings++;
  }
  return { errors, warnings };
}

export function verdictLine(verdict: Verdict, findings: readonly Finding[], lang: Lang): string {
  const { errors, warnings } = countBySeverity(findings);
  return lang === 'de'
    ? `Ergebnis: ${verdict}. ${errors} Fehler, ${warnings} Warnungen.`
    : `Verdict: ${verdict}. ${errors} errors, ${warnings} warnings.`;
}

/** Every finding, unlike the ten-line MCP summary: a script wants the whole list. */
export function findingLines(findings: readonly Finding[], lang: Lang): string[] {
  const lines: string[] = [];
  for (const f of findings) {
    lines.push(`- [${f.layer}] ${f.ruleId} ${f.path}: ${pick(f.message, lang)}`);
    if (f.fixHint) lines.push(`  ${lang === 'de' ? 'Hinweis' : 'Fix'}: ${pick(f.fixHint, lang)}`);
    if (f.legalRef)
      lines.push(`  ${lang === 'de' ? 'Rechtsgrundlage' : 'Legal ref'}: ${f.legalRef}`);
  }
  return lines;
}

/** `--lang` and `--json`, shared by every reporting command. */
export function withOutputOptions(cmd: Command): Command {
  return cmd
    .option('--lang <lang>', 'language of the text output: de or en', 'en')
    .option('--json', 'print the structured result as canonical JSON instead of text');
}

export function parseLang(value: unknown): Lang {
  if (value === 'de' || value === 'en') return value;
  throw new CliInputError(`--lang must be de or en, got "${String(value)}"`);
}
