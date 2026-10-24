import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalJson,
  getField,
  getPath,
  type MappingProposal,
  parsePath,
  sha256Hex,
  type Verdict,
} from '@passwerk/core';
import {
  decodeBase64,
  encodeBase64,
  SessionStore,
  type ToolContext,
  toolByName,
} from '@passwerk/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadSeries } from '../src/series/load.js';
import { mapModel, runModel } from '../src/series/pipeline.js';
import type { ModelOutcome, SeriesModel, StepProgress } from '../src/series/types.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const FIXTURES = join(ROOT, 'packages', 'core', 'test', 'fixtures');
const AS_OF = '2026-10-24T09:00:00Z';
const OPTIONS = { category: 'EV', asOf: AS_OF } as const;

let musterwerk: SeriesModel;
let outcome: ModelOutcome;

beforeAll(async () => {
  const models = await loadSeries(FIXTURES, 'musterwerk');
  expect(models).toHaveLength(1);
  musterwerk = models[0] as SeriesModel;
  outcome = await runModel(musterwerk, OPTIONS);
});

async function call(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tool = toolByName(name);
  if (!tool) throw new Error(`no tool ${name}`);
  const r = await tool.handler(z.object(tool.inputSchema).parse(input), ctx);
  expect(r.isError, `${name}: ${r.text.en}`).not.toBe(true);
  return r.structured as Record<string, unknown>;
}

/** Written apart from the pipeline's policy so the oracle checks the policy too. */
function topPerSlot(proposals: MappingProposal[]): MappingProposal[] {
  const best = new Map<string, MappingProposal>();
  for (const p of proposals) {
    if (p.confidence < 0.7) continue;
    const key = `${p.attributeId}|${p.path ?? ''}`;
    const held = best.get(key);
    if (
      !held ||
      p.confidence > held.confidence ||
      (p.confidence === held.confidence && p.factId < held.factId)
    ) {
      best.set(key, p);
    }
  }
  return [...best.values()];
}

const RANK: Record<Verdict, number> = { valid: 0, valid_with_warnings: 1, invalid: 2 };

describe('runModel', () => {
  it('matches the server tool chain on the Musterwerk fixtures', async () => {
    const ctx: ToolContext = { store: new SessionStore(), clock: AS_OF, log: () => {} };
    const ingested = await call(ctx, 'ingest_documents', {
      inline: musterwerk.files.map((f) => ({ name: f.name, base64: encodeBase64(f.bytes) })),
    });
    const extracted = await call(ctx, 'extract_facts', {
      bundle: { bundleId: ingested['bundleId'] },
    });
    const suggested = await call(ctx, 'suggest_mappings', {
      facts: { factSetId: extracted['factSetId'] },
      category: 'EV',
    });
    const all = suggested['proposals'] as MappingProposal[];
    const accepted = topPerSlot(all);
    const applied = await call(ctx, 'apply_mappings', {
      meta: {
        category: 'EV',
        passportId: 'https://passport.passwerk.example/musterwerk',
        createdAt: AS_OF,
      },
      mappings: accepted.map((p) => ({
        attributeId: p.attributeId,
        value: p.value,
        ...(p.unit !== undefined ? { unit: p.unit } : {}),
        ...(p.path !== undefined ? { path: p.path } : {}),
        source: p.source,
        confidence: p.confidence,
      })),
    });
    const draft = { draftId: applied['draftId'] };
    const validated = await call(ctx, 'validate_passport', { draft, asOf: AS_OF });
    const emitted = await call(ctx, 'emit_passport', {
      draft,
      targets: ['aas-json', 'aasx', 'html'],
      asOf: AS_OF,
    });
    const { draftId: _draftId, ...gap } = await call(ctx, 'gap_report', { draft, asOf: AS_OF });

    const findings = validated['findings'] as { severity: string }[];
    const serverVerdicts = [validated['verdict'], emitted['verdict']] as Verdict[];
    const worst = serverVerdicts.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    const files = emitted['files'] as { name: string; bytes: string }[];
    const digests = await Promise.all(files.map(async (f) => sha256Hex(decodeBase64(f.bytes))));
    const gapDigest = await sha256Hex(new TextEncoder().encode(canonicalJson(gap)));
    const draftAttributes = (applied['draft'] as { attributes: Record<string, { status: string }> })
      .attributes;
    const completeness = gap['completeness'] as { mandatory: { percent: string } };

    expect(outcome).toEqual({
      modelId: 'musterwerk',
      verdict: worst,
      facts: (extracted['facts'] as { facts: unknown[] }).facts.length,
      proposals: all.length,
      accepted: accepted.length,
      mapped: Object.values(draftAttributes).filter((f) => f.status === 'present').length,
      conflicts: (applied['conflicts'] as unknown[]).length,
      findings: {
        errors: findings.filter((f) => f.severity === 'error').length,
        warnings: findings.filter((f) => f.severity === 'warning').length,
      },
      gap: {
        mandatoryCompleteness: Number(completeness.mandatory.percent),
        missingRequired: (gap['items'] as { attributeId: string; bucket: string; status: string }[])
          .filter((i) => i.bucket === 'required' && i.status !== 'present')
          .map((i) => i.attributeId)
          .sort(),
      },
      artefacts: [
        { file: 'musterwerk.aas.json', bytes: expect.any(Number), sha256: digests[0] },
        { file: 'musterwerk.aasx', bytes: expect.any(Number), sha256: digests[1] },
        { file: 'musterwerk.html', bytes: expect.any(Number), sha256: digests[2] },
        { file: 'musterwerk.gaps.json', bytes: expect.any(Number), sha256: gapDigest },
      ],
    });

    const mapped = await mapModel(musterwerk, OPTIONS);
    const ids = (ps: MappingProposal[]) =>
      ps.map((p) => `${p.attributeId}${p.path ? `.${p.path}` : ''}`).sort();
    expect(ids(mapped.accepted)).toEqual(ids(accepted));
  });

  it('gives a byte-identical outcome on a second run', async () => {
    const again = await runModel(musterwerk, OPTIONS);
    expect(canonicalJson(again)).toBe(canonicalJson(outcome));
  });

  it('reports the six steps in order with counts once known', async () => {
    const seen: StepProgress[] = [];
    const r = await runModel(musterwerk, { ...OPTIONS, onStep: (p) => seen.push(p) });
    const steps = seen.map((p) => p.step).filter((s, i, a) => a.indexOf(s) === i);
    expect(steps).toEqual(['ingest', 'extract', 'suggest', 'apply', 'validate', 'emit']);
    expect(seen[0]).toEqual({ step: 'ingest' });
    expect(seen.find((p) => p.facts !== undefined)).toEqual({ step: 'extract', facts: r.facts });
    expect(seen.find((p) => p.mapped !== undefined)).toEqual({
      step: 'apply',
      facts: r.facts,
      mapped: r.mapped,
    });
    expect(seen.at(-1)).toEqual({ step: 'emit', facts: r.facts, mapped: r.mapped });
  });

  it('maps at least 80 % of the expected Musterwerk attributes (core recall gate)', async () => {
    const expected = JSON.parse(
      readFileSync(join(FIXTURES, 'musterwerk', 'expected.json'), 'utf8'),
    ) as { attributes: { attributeId: string; value: string; path?: string }[] };
    const { draft } = await mapModel(musterwerk, OPTIONS);
    const misses = expected.attributes.filter((e) => {
      const value = getField(draft, e.attributeId)?.value;
      return (e.path === undefined ? value : getPath(value, parsePath(e.path))) !== e.value;
    });
    const ratio = 1 - misses.length / expected.attributes.length;
    expect(
      ratio,
      `missed: ${misses.map((e) => `${e.attributeId}${e.path ? `.${e.path}` : ''}`).join(', ')}`,
    ).toBeGreaterThanOrEqual(0.8);
  });
});
