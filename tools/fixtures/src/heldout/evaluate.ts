/**
 * Held-out evaluation (ADR D-024): run the real pipeline over the held-out documents and the
 * Musterwerk fixtures, score the proposals against what a reviewer expects, and render
 * `docs/EVALUATION.md`. Deterministic: no clock, sorted output. Run after `pnpm build`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFacts, ingest, type MappingProposal, suggestMappings } from '@passwerk/core';
import type { Category, ExpectedMapping, HeldoutFile } from './content.js';
import { HELDOUT_DIR, type HeldoutManifest } from './generate.js';

const here = dirname(fileURLToPath(import.meta.url));
export const REPORT_PATH = join(here, '..', '..', '..', '..', 'docs', 'EVALUATION.md');
export const MUSTERWERK_DIR = join(HELDOUT_DIR, '..', 'musterwerk');

export const THRESHOLD = 0.7;

export interface ScoredExpectation extends ExpectedMapping {
  outcome: 'accept' | 'edit' | 'manual';
  /** For `edit`: what the pipeline proposed instead. */
  proposed?: string;
}

export interface FalsePositive {
  file: string;
  attributeId: string;
  matched: string;
  value: string;
  confidence: number;
}

export interface FileMetrics {
  file: string;
  category: Category;
  expected: number;
  accepts: number;
  edits: number;
  rejects: number;
  manual: number;
  proposals: number;
}

export interface SetMetrics {
  name: string;
  files: FileMetrics[];
  expectations: ScoredExpectation[];
  falsePositives: FalsePositive[];
  totals: Omit<FileMetrics, 'file' | 'category'>;
}

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

interface SetInput {
  name: string;
  dir: string;
  files: { name: string; category: Category }[];
  expected: ExpectedMapping[];
}

function sameTarget(p: MappingProposal, e: ExpectedMapping): boolean {
  return (
    p.attributeId === e.attributeId &&
    p.source.some((s) => s.file === e.file) &&
    (e.path === undefined ||
      p.path === e.path ||
      (e.path.startsWith('name.') && (p.path?.startsWith('name.') ?? false)))
  );
}

/**
 * Value equality in the knowledge-base unit. A proposal without a unit is accepted when its
 * value already equals the expected one: the attribute fixes the unit (cycles, V, kg), so a
 * bare "12.000" under "Zyklenzahl" needs no correction. A proposal carrying a *different* unit
 * is an edit.
 */
function sameValue(p: MappingProposal, e: ExpectedMapping): boolean {
  return (
    show(p.value) === e.value && (e.unit === undefined || p.unit === undefined || p.unit === e.unit)
  );
}

export async function evaluateSet(input: SetInput): Promise<SetMetrics> {
  const expectations: ScoredExpectation[] = [];
  const falsePositives: FalsePositive[] = [];
  const files: FileMetrics[] = [];
  for (const f of input.files) {
    const bundle = await ingest([
      { name: f.name, bytes: new Uint8Array(readFileSync(join(input.dir, f.name))) },
    ]);
    const confident = suggestMappings(extractFacts(bundle), { category: f.category }).filter(
      (p) => p.confidence >= THRESHOLD,
    );
    const mine = input.expected.filter((e) => e.file === f.name);
    const used = new Set<MappingProposal>();
    let accepts = 0;
    let edits = 0;
    let manual = 0;
    for (const e of mine) {
      const hit = confident.find((p) => !used.has(p) && sameTarget(p, e) && sameValue(p, e));
      if (hit) {
        used.add(hit);
        accepts += 1;
        expectations.push({ ...e, outcome: 'accept' });
        continue;
      }
      const near = confident.find((p) => !used.has(p) && sameTarget(p, e));
      if (near) {
        used.add(near);
        edits += 1;
        expectations.push({
          ...e,
          outcome: 'edit',
          proposed: `${show(near.value)}${near.unit ? ` ${near.unit}` : ''}`,
        });
        continue;
      }
      manual += 1;
      expectations.push({ ...e, outcome: 'manual' });
    }
    let rejects = 0;
    for (const p of confident) {
      if (used.has(p)) continue;
      rejects += 1;
      falsePositives.push({
        file: f.name,
        attributeId: p.attributeId,
        matched: p.checks.matched,
        value: `${show(p.value)}${p.unit ? ` ${p.unit}` : ''}`,
        confidence: p.confidence,
      });
    }
    files.push({
      file: f.name,
      category: f.category,
      expected: mine.length,
      accepts,
      edits,
      rejects,
      manual,
      proposals: confident.length,
    });
  }
  const sum = (k: keyof Omit<FileMetrics, 'file' | 'category'>) =>
    files.reduce((n, f) => n + f[k], 0);
  return {
    name: input.name,
    files,
    expectations,
    falsePositives,
    totals: {
      expected: sum('expected'),
      accepts: sum('accepts'),
      edits: sum('edits'),
      rejects: sum('rejects'),
      manual: sum('manual'),
      proposals: sum('proposals'),
    },
  };
}

export function loadHeldout(): { manifest: HeldoutManifest; input: SetInput } {
  const manifest = JSON.parse(
    readFileSync(join(HELDOUT_DIR, 'expected.json'), 'utf8'),
  ) as HeldoutManifest;
  return {
    manifest,
    input: {
      name: 'Held-out (public datasheets)',
      dir: HELDOUT_DIR,
      files: manifest.files.map((f: HeldoutFile) => ({ name: f.name, category: f.category })),
      expected: manifest.expected,
    },
  };
}

interface MusterwerkExpected {
  files: Record<string, unknown>;
  attributes: {
    attributeId: string;
    value: string;
    unit?: string;
    path?: string;
    source: { file: string };
  }[];
}

export function loadMusterwerk(): SetInput {
  const raw = JSON.parse(
    readFileSync(join(MUSTERWERK_DIR, 'expected.json'), 'utf8'),
  ) as MusterwerkExpected;
  return {
    name: 'Musterwerk (authored fixtures, Phase 4 recall gate)',
    dir: MUSTERWERK_DIR,
    files: Object.keys(raw.files).map((name) => ({ name, category: 'EV' as const })),
    expected: raw.attributes.map((a) => ({
      file: a.source.file,
      attributeId: a.attributeId,
      value: a.value,
      ...(a.unit ? { unit: a.unit } : {}),
      ...(a.path ? { path: a.path } : {}),
      label: '',
    })),
  };
}

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)} %`);
const cell = (s: string) => s.replace(/\|/g, '\\|');

function metricsTable(set: SetMetrics): string[] {
  const head = [
    '| Document | Category | Expected | Accept | Edit | Reject | Manual | Recall | Precision | Effort |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  const row = (f: Omit<FileMetrics, 'file' | 'category'>, name: string, category: string) =>
    `| ${cell(name)} | ${category} | ${f.expected} | ${f.accepts} | ${f.edits} | ${f.rejects} | ${f.manual} | ${pct(f.accepts, f.expected)} | ${pct(f.accepts, f.proposals)} | ${f.edits + f.rejects + f.manual} |`;
  return [
    ...head,
    ...set.files.map((f) => row(f, f.file, f.category)),
    row(set.totals, '**Total**', ''),
  ];
}

export function renderReport(
  heldout: SetMetrics,
  manifest: HeldoutManifest,
  musterwerk: SetMetrics,
): string {
  const L: string[] = [];
  L.push('# Mapping evaluation on held-out supplier documents');
  L.push('');
  L.push(
    'Generated by `pnpm heldout` (tools/fixtures/src/heldout/evaluate.ts). Do not edit by hand; a',
    'test fails when this file does not match a fresh run.',
  );
  L.push('');
  L.push('## Why this exists');
  L.push('');
  L.push(
    'The Phase 4 recall gate (32/34 on the Musterwerk fixtures) measures documents written by the',
    'same hands that wrote the synonym index, so it is a training-set number. This set transcribes',
    'label wording and values **verbatim** from public datasheets that were never consulted while',
    'authoring the knowledge base, re-typeset into the layouts a Tier-2 supplier would actually',
    'send (CSV export, spreadsheet, PDF datasheet, Word table, plain text, retailer listing).',
    'Original PDFs are not redistributed. The knowledge base was not changed in response to these',
    'numbers; if it ever is, this section must say so (ADR D-024).',
  );
  L.push('');
  L.push('## Metrics');
  L.push('');
  L.push(
    `A proposal counts only at confidence >= ${THRESHOLD}. Each expected mapping (attribute, value in the`,
    'knowledge-base unit, source document) is scored once:',
    '',
    '- **Accept**: a proposal names the attribute with the expected value and unit.',
    '- **Edit**: a proposal names the attribute but with a different value or unit (an incorrect high-confidence mapping the reviewer must correct).',
    '- **Manual**: nothing was proposed; the reviewer enters the value by hand.',
    '- **Reject**: a high-confidence proposal for something the reviewer did not expect (an incorrect high-confidence mapping).',
    '',
    '**Recall** = Accept / Expected. **Precision** = Accept / all proposals at or above the threshold.',
    '**Effort** = Edit + Reject + Manual, the number of reviewer actions to reach the expected mapping.',
    'Provenance is matched at file level; composite `name.<lang>` paths match either language. A',
    'proposal without a unit counts as Accept when the value already equals the expected one, because',
    'the attribute fixes the unit; a proposal with a different unit is an Edit.',
  );
  L.push('');
  L.push('## Results');
  L.push('');
  L.push(`### ${heldout.name}`);
  L.push('');
  L.push(...metricsTable(heldout));
  L.push('');
  L.push(`### ${musterwerk.name}`);
  L.push('');
  L.push(
    'Same scorer, same threshold, for comparison. (The Phase 4 gate itself also checks provenance',
    'per cell or line and is unchanged in `mapping.recall.test.ts`.)',
  );
  L.push('');
  L.push(...metricsTable(musterwerk));
  L.push('');
  L.push('## Held-out detail');
  L.push('');
  L.push('### Incorrect high-confidence proposals (Reject)');
  L.push('');
  if (heldout.falsePositives.length === 0) L.push('None.');
  else {
    L.push('| Document | Proposed attribute | Matched synonym | Proposed value | Confidence |');
    L.push('|---|---|---|---|---:|');
    for (const f of heldout.falsePositives)
      L.push(
        `| ${cell(f.file)} | ${f.attributeId} | ${cell(f.matched)} | ${cell(f.value)} | ${f.confidence.toFixed(2)} |`,
      );
  }
  L.push('');
  L.push('### Expected mappings and their outcome');
  L.push('');
  L.push(
    '| Document | Printed label | Attribute | Expected value | Outcome | Proposed instead / note |',
  );
  L.push('|---|---|---|---|---|---|');
  for (const e of heldout.expectations) {
    const value = `${e.value}${e.unit ? ` ${e.unit}` : ''}${e.path ? ` (${e.path})` : ''}`;
    const extra = e.outcome === 'edit' ? `proposed ${e.proposed ?? ''}` : (e.note ?? '');
    L.push(
      `| ${cell(e.file)} | ${cell(e.label)} | ${e.attributeId} | ${cell(value)} | ${e.outcome} | ${cell(extra)} |`,
    );
  }
  L.push('');
  L.push('## Sources');
  L.push('');
  L.push(`All accessed on ${manifest.accessed}.`);
  L.push('');
  for (const s of manifest.sources) {
    L.push(`- **${s.title}**, ${s.publisher}, ${s.version}. <${s.url}>  `);
    L.push(`  Transcribed: ${s.transcribed}`);
    for (const sub of s.substitutions) L.push(`  Deviation: ${sub}`);
  }
  L.push('');
  L.push('## Documents');
  L.push('');
  L.push('| File | Source | Category | Language | Layout |');
  L.push('|---|---|---|---|---|');
  for (const f of manifest.files)
    L.push(`| ${f.name} | ${f.source} | ${f.category} | ${f.lang} | ${cell(f.layout)} |`);
  L.push('');
  L.push('## Limitations');
  L.push('');
  L.push(
    '- Six documents and a few dozen expectations: enough to expose layout and wording gaps, not',
    '  enough for a confidence interval. Treat every figure as a direction, not a benchmark.',
    '- The documents were transcribed and the expectations written by the passwerk maintainers,',
    '  not by an independent reviewer; the wording is unseen, the judgement of what "should" map is not.',
    '- One source is a retailer listing, not a manufacturer document; it is included because that is',
    '  exactly the kind of sheet a small supplier forwards.',
    '- Typesetting is ours: real datasheets add merged cells, footnotes and multi-column model tables',
    '  that these writers do not reproduce (the BYD table was reduced to one model column).',
  );
  L.push('');
  return `${L.join('\n')}\n`;
}

export async function evaluateAll(): Promise<{
  report: string;
  heldout: SetMetrics;
  musterwerk: SetMetrics;
}> {
  const { manifest, input } = loadHeldout();
  const heldout = await evaluateSet(input);
  const musterwerk = await evaluateSet(loadMusterwerk());
  return { report: renderReport(heldout, manifest, musterwerk), heldout, musterwerk };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { report, heldout } = await evaluateAll();
  writeFileSync(REPORT_PATH, report);
  const t = heldout.totals;
  console.log(
    `held-out: expected ${t.expected}, accept ${t.accepts}, edit ${t.edits}, reject ${t.rejects}, manual ${t.manual}; wrote ${REPORT_PATH}`,
  );
}
