import type { GapItem, GapReport } from '@passwerk/core';
import { parseLang, pick, printJson, withOutputOptions } from '../format.js';
import { EXIT_USAGE, type Lang } from '../io.js';
import { registerCommand } from '../program.js';
import { invokeOnDraft } from './draft.js';

interface Options {
  asOf?: string;
  lang: string;
  json?: boolean;
}

const isOpen = (i: GapItem): boolean => i.status !== 'present' && i.status !== 'not_applicable';

function openRequired(gap: GapReport): GapItem[] {
  return gap.items.filter((i) => i.bucket === 'required' && isOpen(i));
}

/**
 * 0 when no `required` item is open, else 1. The mandatory completeness figure counts deferred
 * data points the report itself calls "not a gap", so it is not the exit criterion.
 */
export function gapExitCode(gap: GapReport): number {
  return openRequired(gap).length === 0 ? 0 : 1;
}

/**
 * The to-do list grouped by who typically has the data. Complete attributes are left out, and
 * so are deferred ones (the report itself says their absence is not a gap); they are counted.
 */
export function gapLines(gap: GapReport, lang: Lang): string[] {
  const m = gap.completeness.mandatory;
  const o = gap.completeness.overall;
  const required = openRequired(gap).length;
  const deferred = gap.items.filter((i) => i.bucket === 'deferred' && isOpen(i)).length;
  const lines = [
    lang === 'de'
      ? `Pflichtangaben ${m.present}/${m.total} (${m.percent} %), gesamt ${o.present}/${o.total} (${o.percent} %). Offene Pflichtangaben: ${required}. ${deferred} zurückgestellte Datenpunkte (noch nicht anwendbar) nicht aufgeführt. Keine Rechtsberatung.`
      : `Mandatory ${m.present}/${m.total} (${m.percent} %), overall ${o.present}/${o.total} (${o.percent} %). Open required: ${required}. ${deferred} deferred data points (not yet applicable) not listed. Not legal advice.`,
  ];
  const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
  for (const owner of gap.byDataOwner) {
    const open = owner.attributeIds
      .map((id) => byId.get(id))
      .filter((i) => i !== undefined && i.bucket !== 'deferred' && isOpen(i));
    if (open.length === 0) continue;
    lines.push('', `## ${pick(owner.owner, lang)}`);
    for (const i of open) {
      if (!i) continue;
      const refs = i.legalRefs.length > 0 ? `: ${i.legalRefs.join('; ')}` : '';
      lines.push(`- ${i.attributeId} (${pick(i.name, lang)}) [${i.bucket}, ${i.status}]${refs}`);
      lines.push(`  ${pick(i.suggestedAction, lang)}`);
    }
  }
  return lines;
}

registerCommand((program, io, exit) => {
  withOutputOptions(
    program
      .command('gaps')
      .description(
        'gap report for a PassportDraft, grouped by data owner (exit 0 complete, 1 open)',
      )
      .argument('<draft.json>', 'the PassportDraft file')
      .option('--as-of <iso>', 'ISO date-time treated as "now" for applicability'),
  ).action(async (path: string, options: Options) => {
    const lang = parseLang(options.lang);
    const { result } = await invokeOnDraft(io, 'gap_report', path, {
      ...(options.asOf !== undefined ? { asOf: options.asOf } : {}),
    });
    if (result.isError) {
      io.stderr.write(`${String(result.structured['error'])}\n`);
      exit(EXIT_USAGE);
      return;
    }
    const gap = result.structured as unknown as GapReport;
    if (options.json) printJson(io, result.structured);
    else io.stdout.write(`${gapLines(gap, lang).join('\n')}\n`);
    exit(gapExitCode(gap));
  });
});
