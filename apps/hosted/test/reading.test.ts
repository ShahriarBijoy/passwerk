import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyMappings,
  canonicalJson,
  emitAasJson,
  emitAasx,
  emitHtml,
  gapReport,
  getField,
  getPath,
  ingest,
  type MappingDecision,
  parsePath,
  type Verdict,
  validate,
} from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type Ask,
  createReader,
  JEV_MODEL,
  jevAsk,
  parseCassette,
  type Reader,
  type ReadingResult,
  readerFromEnv,
  recordedReader,
  replayReader,
} from '../src/reading/index.js';
import { DOCUMENT_LEAVES, ENTRY_LEAVES, leafKind, OBJECT_LEAVES } from '../src/reading/schema.js';
import { loadSeries } from '../src/series/load.js';
import { mapModel, passportIdFor, readModel, runModel } from '../src/series/pipeline.js';
import type {
  ModelOutcome,
  ReadingProposal,
  SeriesModel,
  StepProgress,
} from '../src/series/types.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SERIES = join(ROOT, 'demo', 'series');
const AS_OF = '2026-10-24T09:00:00Z';
const OPTIONS = { category: 'EV', asOf: AS_OF } as const;
const READ = { ...OPTIONS, read: true } as const;

const cassette = (series: string) =>
  parseCassette(
    readFileSync(join(import.meta.dirname, 'fixtures', 'jev', `${series}.json`), 'utf8'),
  );

async function single(series: string): Promise<SeriesModel> {
  const [model] = await loadSeries(SERIES, series);
  if (!model) throw new Error(`no model in ${series}`);
  return model;
}

const normalise = (s: string) =>
  s
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();

async function documentText(model: SeriesModel): Promise<string> {
  const bundle = await ingest(
    model.files.map((f) => ({ name: f.name, bytes: new Uint8Array(f.bytes) })),
  );
  const cells = bundle.documents.flatMap((d) =>
    d.pages.flatMap((p) => [
      ...p.lines.map((l) => l.text),
      ...p.tables.flatMap((t) => t.rows.flatMap((r) => r.map((c) => c.text))),
    ]),
  );
  return normalise(cells.join('\n'));
}

function leaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(leaves);
  throw new Error(`unexpected leaf ${String(value)}`);
}

/** Every string the reader wrote, applied or held, is a string the documents contain. */
async function expectCopiedFromDocuments(
  model: SeriesModel,
  values: { attributeId: string; value: unknown; recordedAt?: string }[],
) {
  const text = await documentText(model);
  for (const v of values) {
    for (const leaf of [...leaves(v.value), ...(v.recordedAt ? [v.recordedAt] : [])]) {
      expect(text, `${v.attributeId}: ${leaf}`).toContain(normalise(leaf));
    }
  }
}

const slot = (p: { attributeId: string; path?: string | undefined }) =>
  `${p.attributeId}${p.path ? `.${p.path}` : ''}`;

const RANK: Record<Verdict, number> = { valid: 0, valid_with_warnings: 1, invalid: 2 };

describe('AI reading on the complete Musterwerk pack, replayed', () => {
  let model: SeriesModel;
  let outcome: ModelOutcome;
  let toConfirm: ReadingProposal[];

  beforeAll(async () => {
    model = await single('musterwerk-complete');
    outcome = (await runModel(model, READ, replayReader(cassette('musterwerk-complete')))).outcome;
    toConfirm = outcome.reading?.toConfirm ?? [];
  });

  it('applies what the policy lets through, without conflicts or vetoes', () => {
    expect(outcome.reading).toMatchObject({ applied: 16, vetoed: 0, requests: 11 });
    expect(outcome.conflicts).toBe(0);
    expect(outcome.gap.mandatoryCompleteness).toBe(87.2);
  });

  it('stays invalid: the policy holds back every table-built list and three low-confidence picks', () => {
    expect(outcome.verdict).toBe('invalid');
    expect(outcome.gap.missingRequired).toEqual([
      'componentPartNumbers',
      'criticalRawMaterials',
      'electrodeAndElectrolyteMaterials',
      'hazardousSubstances',
      'initialInternalResistance',
      'sparePartSources',
    ]);
    expect(toConfirm.map(slot)).toEqual([
      'componentPartNumbers',
      'criticalRawMaterials',
      'electrodeAndElectrolyteMaterials',
      'hazardousSubstances',
      'initialInternalResistance.packOhm',
      'manufacturerInformation.address.cityTown',
      'manufacturerInformation.address.nationalCode',
      'manufacturerInformation.address.street',
      'manufacturerInformation.address.zipCode',
      'sparePartSources',
      'temperatureInformation',
    ]);
    for (const id of outcome.gap.missingRequired) {
      expect(toConfirm.map((p) => p.attributeId)).toContain(id);
    }
  });

  it('copies every applied and held value from the documents', async () => {
    const { draft } = await readModel(
      'musterwerk-complete',
      await mapModel(model, READ),
      READ,
      replayReader(cassette('musterwerk-complete')),
    );
    const read = Object.entries(draft.attributes).flatMap(([attributeId, f]) =>
      f?.source.some((s) => s.note?.startsWith(`read by ${JEV_MODEL}`))
        ? [{ attributeId, value: f.value, ...(f.recordedAt ? { recordedAt: f.recordedAt } : {}) }]
        : [],
    );
    expect(read.length).toBeGreaterThan(0);
    await expectCopiedFromDocuments(model, [...read, ...toConfirm]);
  });

  it('validates and emits valid at 100 % once a person confirms every held value', async () => {
    const { draft } = await readModel(
      'musterwerk-complete',
      await mapModel(model, READ),
      READ,
      replayReader(cassette('musterwerk-complete')),
    );
    const confirmed: MappingDecision[] = toConfirm.map((p) => ({
      attributeId: p.attributeId,
      value: p.value,
      ...(p.path ? { path: p.path } : {}),
      ...(p.unit ? { unit: p.unit } : {}),
      ...(p.recordedAt ? { recordedAt: p.recordedAt } : {}),
      source: [{ file: p.source.split(' ')[0] ?? p.source, note: 'confirmed by a person' }],
      confidence: 1,
      override: true,
    }));
    const applied = applyMappings(draft, confirmed);
    expect(applied.conflicts).toEqual([]);
    const asOf = { asOf: AS_OF };
    const report = validate(applied.draft, asOf);
    let worst = report;
    for (const r of [
      emitAasJson(applied.draft, asOf),
      emitAasx(applied.draft, asOf),
      emitHtml(applied.draft, { ...asOf, lang: 'en' }),
    ]) {
      if (RANK[r.verdict] > RANK[worst.verdict]) worst = { ...report, ...r };
    }
    expect(worst.findings.map((f) => `${f.ruleId} ${f.attributeId ?? ''}`)).toEqual([]);
    expect(worst.verdict).toBe('valid');
    expect(gapReport(applied.draft, { report, ...asOf }).completeness.mandatory.percent).toBe(
      '100.0',
    );
  });

  it('reports the read step between apply and validate', async () => {
    const seen: StepProgress[] = [];
    await runModel(
      model,
      { ...READ, onStep: (p) => seen.push(p) },
      replayReader(cassette('musterwerk-complete')),
    );
    const steps = seen.map((p) => p.step).filter((s, i, a) => a.indexOf(s) === i);
    expect(steps).toEqual(['ingest', 'extract', 'suggest', 'apply', 'read', 'validate', 'emit']);
  });

  it('gives a byte-identical outcome on a second replay', async () => {
    const again = (await runModel(model, READ, replayReader(cassette('musterwerk-complete'))))
      .outcome;
    expect(canonicalJson(again)).toBe(canonicalJson(outcome));
  });
});

/** Wraps a reader and keeps what it read last, as the series worker does. */
function keeping(reader: Reader) {
  const kept: { last?: ReadingResult } = {};
  const wrapped: Reader = { read: async (input) => (kept.last = await reader.read(input)) };
  return { reader: wrapped, kept };
}

describe('a recorded reading, replayed without asking Jev', () => {
  let model: SeriesModel;
  let first: ModelOutcome;
  let recorded: ReadingResult;

  beforeAll(async () => {
    model = await single('musterwerk-complete');
    const k = keeping(replayReader(cassette('musterwerk-complete')));
    first = (await runModel(model, READ, k.reader)).outcome;
    if (!k.kept.last) throw new Error('the reader never ran');
    recorded = k.kept.last;
  });

  it('holds the eleven values with their documents, and confirms none on a first reading', () => {
    expect(recorded.held).toHaveLength(11);
    expect(recorded.confirmed).toEqual([]);
    expect(first.reading?.confirmed).toBe(0);
    for (const h of recorded.held) expect(h.decision.source.length).toBeGreaterThan(0);
  });

  it('gives the first outcome again when nothing is confirmed', async () => {
    const again = (await runModel(model, READ, recordedReader(recorded))).outcome;
    expect(canonicalJson(again)).toBe(canonicalJson(first));
  });

  it('applies every confirmed value with its document provenance: valid at 100 %', async () => {
    const all: ReadingResult = { ...recorded, held: [], confirmed: recorded.held };
    const outcome = (await runModel(model, READ, recordedReader(all))).outcome;
    expect(outcome.verdict).toBe('valid');
    expect(outcome.gap.mandatoryCompleteness).toBe(100);
    expect(outcome.reading).toMatchObject({ applied: 16, confirmed: 11, toConfirm: [] });
    expect(outcome.reading?.requests).toBe(first.reading?.requests);

    const { draft } = await readModel(
      'musterwerk-complete',
      await mapModel(model, READ),
      READ,
      recordedReader(all),
    );
    for (const { decision: d } of recorded.held) {
      const field = getField(draft, d.attributeId);
      const value = d.path === undefined ? field?.value : getPath(field?.value, parsePath(d.path));
      expect(canonicalJson(value), slot(d)).toBe(canonicalJson(d.value));
      for (const s of d.source) {
        expect(field?.source, slot(d)).toContainEqual({
          ...s,
          note: `${s.note}; confirmed by a person`,
        });
      }
    }
  });
});

describe('AI reading on the base Musterwerk pack, replayed', () => {
  it('keeps or raises completeness and writes only values the documents contain', async () => {
    const model = await single('musterwerk');
    const without = (await runModel(model, OPTIONS)).outcome;
    const reader = replayReader(cassette('musterwerk'));
    const withReading = (await runModel(model, READ, reader)).outcome;
    expect(withReading.gap.mandatoryCompleteness).toBeGreaterThanOrEqual(
      without.gap.mandatoryCompleteness,
    );
    expect(withReading.conflicts).toBe(0);
    const { draft } = await readModel('musterwerk', await mapModel(model, READ), READ, reader);
    const read = Object.entries(draft.attributes).flatMap(([attributeId, f]) =>
      f?.source.some((s) => s.note?.startsWith(`read by ${JEV_MODEL}`))
        ? [{ attributeId, value: f.value }]
        : [],
    );
    await expectCopiedFromDocuments(model, [...read, ...(withReading.reading?.toConfirm ?? [])]);
  });
});

/** Answers every Choice with `none` (or its first option) and every Noul with `yes`. */
const answering =
  (yes: number): Ask =>
  async (_stage, request) => ({
    model: request.model,
    inputTokens: 1,
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([id, q]) => {
        if (q.type !== 'choice') return [id, { type: 'noul', noul: yes }];
        const pick = 'none' in q.criteria ? 'none' : (Object.keys(q.criteria)[0] ?? 'none');
        return [id, { type: 'choice', choice: pick, confidence: 1, probabilities: { [pick]: 1 } }];
      }),
    ),
  });

describe('the veto on rule-based accepts', () => {
  let model: SeriesModel;
  let automatic: ModelOutcome;

  beforeAll(async () => {
    model = await single('musterwerk');
    automatic = (await runModel(model, OPTIONS)).outcome;
  });

  it('drops every accept a near-certain no (P(no) = 0.99) answers, passport id included', async () => {
    const reader = createReader(answering(0.01));
    const r = (await runModel(model, READ, reader)).outcome;
    expect(r.reading?.vetoed).toBe(automatic.accepted);
    expect(r.accepted).toBe(0);
    expect(r.mapped).toBe(0);
    const { draft } = await readModel('musterwerk', await mapModel(model, READ), READ, reader);
    expect(draft.meta.passportId).toBe(passportIdFor('musterwerk'));
  });

  it('keeps every accept below the veto threshold (P(no) = 0.94)', async () => {
    const r = (await runModel(model, READ, createReader(answering(0.06)))).outcome;
    expect(r.reading?.vetoed).toBe(0);
    expect(r.accepted).toBe(automatic.accepted);
    expect(r.mapped).toBe(automatic.mapped);
  });
});

describe('reader construction and failures', () => {
  it('fails clearly when reading is on and no key is set', () => {
    expect(() => readerFromEnv({})).toThrow('AI reading is on but TYPESAFE_API_KEY is not set');
    expect(() => readerFromEnv({ TYPESAFE_API_KEY: '  ' })).toThrow(
      'AI reading is on but TYPESAFE_API_KEY is not set',
    );
  });

  it('refuses to read without a reader', async () => {
    await expect(runModel(await single('musterwerk'), READ)).rejects.toThrow(
      'AI reading is on but no reader is configured',
    );
  });

  it('names the stage and how to re-record when the cassette has no answer', async () => {
    const empty = replayReader({ model: JEV_MODEL, entries: {} });
    await expect(runModel(await single('musterwerk'), READ, empty)).rejects.toThrow(
      /model musterwerk: read failed: no recorded Jev answer for the \w+ .*request [0-9a-f]{12} .*Re-record with: pnpm --filter @passwerk\/hosted exec tsx scripts\/record-jev\.ts/,
    );
  });

  it('scrubs the key from API errors', async () => {
    const apiKey = 'test-key-0123456789abcdef';
    const fetch = async () =>
      new Response(JSON.stringify({ error: `invalid key ${apiKey}` }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    const ask = jevAsk({ apiKey, model: JEV_MODEL, fetch });
    const failure = ask('veto', {
      model: JEV_MODEL,
      state: { battery: 'x' },
      questions: { q: { type: 'noul', instructions: 'Is this a battery?' } },
    });
    await expect(failure).rejects.toThrow(/Jev veto request failed: AuthenticationError/);
    await expect(failure).rejects.not.toThrow(apiKey);
    await expect(failure).rejects.toThrow('[redacted]');
  });
});

describe('reading schema', () => {
  it('names only leaves that exist in core’s composite schemas', () => {
    for (const [id, leaves] of [
      ...Object.entries(ENTRY_LEAVES),
      ...Object.entries(OBJECT_LEAVES),
    ]) {
      for (const path of Object.keys(leaves)) expect(() => leafKind(id, path)).not.toThrow();
    }
    for (const path of Object.keys(DOCUMENT_LEAVES)) {
      expect(() => leafKind('document', path)).not.toThrow();
    }
    expect(leafKind('criticalRawMaterials', 'massKg')).toBe('decimal');
    expect(leafKind('hazardousSubstances', 'impacts')).toBe('list');
    expect(leafKind('sparePartSources', 'name')).toBe('multilingual');
    expect(leafKind('document', 'languages')).toBe('list');
    expect(leafKind('initialInternalResistance', 'packOhm')).toBe('decimal');
    expect(() => leafKind('batteryChemistry', 'formula')).toThrow('has no leaf');
  });
});
