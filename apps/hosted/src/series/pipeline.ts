import {
  applyMappings,
  byCodePoint,
  canonicalJson,
  type DocumentBundle,
  emitAasJson,
  emitAasx,
  emitHtml,
  extractFacts,
  type FactSet,
  type Finding,
  gapReport,
  ingest,
  type MappingConflict,
  type MappingDecision,
  type MappingProposal,
  newDraft,
  type PassportDraft,
  SCHEMA_VERSION,
  sha256Hex,
  suggestMappings,
  type Verdict,
  validate,
} from '@passwerk/core';
import { type HeldValue, openTargets, type Reader, slotKey } from '../reading/index.js';
import type {
  ArtefactDigest,
  ModelOutcome,
  PipelineStep,
  ReadingProposal,
  ReadingSummary,
  RunModelOptions,
  SeriesModel,
} from './types.js';

/** The recall-gate threshold of Phase 4 (ADR D-047). */
export const ACCEPT_THRESHOLD = 0.7;

/**
 * Headless accept policy: per attribute, and per leaf for composite proposals that carry a
 * `path`, the single most confident proposal at or above the threshold. Ties go to the lower
 * fact id. Sorted by attribute id and path so the decisions apply in a stable order.
 */
export function acceptTopProposals(proposals: readonly MappingProposal[]): MappingProposal[] {
  const best = new Map<string, MappingProposal>();
  for (const p of proposals) {
    if (p.confidence < ACCEPT_THRESHOLD) continue;
    const slot = `${p.attributeId}\u0000${p.path ?? ''}`;
    const held = best.get(slot);
    if (
      !held ||
      p.confidence > held.confidence ||
      (p.confidence === held.confidence && byCodePoint(p.factId, held.factId) < 0)
    ) {
      best.set(slot, p);
    }
  }
  return [...best.values()].sort(
    (a, b) => byCodePoint(a.attributeId, b.attributeId) || byCodePoint(a.path ?? '', b.path ?? ''),
  );
}

export function passportIdFor(modelId: string): string {
  return `https://passport.passwerk.example/${encodeURIComponent(modelId)}`;
}

/**
 * The passport identifier the documents state, when the accept policy took one; otherwise an
 * id derived from the model. Meta and attribute must agree (PW-L1-PASSPORT-ID-MISMATCH).
 */
export function passportIdOf(modelId: string, accepted: readonly MappingProposal[]): string {
  const stated = accepted.find((p) => p.attributeId === 'batteryPassportIdentifier')?.value;
  return typeof stated === 'string' ? stated : passportIdFor(modelId);
}

const decisionOf = (p: MappingProposal): MappingDecision => ({
  attributeId: p.attributeId,
  value: p.value,
  ...(p.unit !== undefined ? { unit: p.unit } : {}),
  ...(p.path !== undefined ? { path: p.path } : {}),
  source: p.source,
  confidence: p.confidence,
});

async function inStep<T>(
  modelId: string,
  step: PipelineStep,
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`model ${modelId}: ${step} failed: ${message}`, { cause: e });
  }
}

export interface MappedModel {
  bundle: DocumentBundle;
  factSet: FactSet;
  facts: number;
  /** Attributes whose field is `present` after apply. */
  mapped: number;
  proposals: MappingProposal[];
  accepted: MappingProposal[];
  draft: PassportDraft;
  conflicts: MappingConflict[];
}

/** Ingest, extract, suggest and apply: the draft the accept policy builds from the documents. */
export async function mapModel(model: SeriesModel, o: RunModelOptions): Promise<MappedModel> {
  const { modelId } = model;
  o.onStep?.({ step: 'ingest' });
  const bundle = await inStep(modelId, 'ingest', () =>
    ingest(model.files.map((f) => ({ name: f.name, bytes: new Uint8Array(f.bytes) }))),
  );
  o.onStep?.({ step: 'extract' });
  const factSet = await inStep(modelId, 'extract', () => extractFacts(bundle));
  const facts = factSet.facts.length;
  o.onStep?.({ step: 'extract', facts });
  o.onStep?.({ step: 'suggest', facts });
  const proposals = await inStep(modelId, 'suggest', () =>
    suggestMappings(factSet, { category: o.category }),
  );
  o.onStep?.({ step: 'apply', facts });
  const accepted = acceptTopProposals(proposals);
  const result = await inStep(modelId, 'apply', () =>
    applyMappings(
      newDraft({
        schemaVersion: SCHEMA_VERSION,
        category: o.category,
        passportId: passportIdOf(modelId, accepted),
        createdAt: o.asOf,
      }),
      accepted.map(decisionOf),
    ),
  );
  const mapped = presentCount(result.draft);
  o.onStep?.({ step: 'apply', facts, mapped });
  return {
    bundle,
    factSet,
    facts,
    mapped,
    proposals,
    accepted,
    draft: result.draft,
    conflicts: result.conflicts,
  };
}

const presentCount = (draft: PassportDraft) =>
  Object.values(draft.attributes).filter((f) => f?.status === 'present').length;

/** A confirmed value keeps its document provenance, and says a person confirmed it. */
const confirmedDecision = ({ decision: d }: HeldValue): MappingDecision => ({
  ...d,
  source: d.source.map((s) => ({ ...s, note: `${s.note ?? 'read'}; confirmed by a person` })),
});

const proposalOf = ({ decision: d, where, reason }: HeldValue): ReadingProposal => ({
  attributeId: d.attributeId,
  ...(d.path !== undefined ? { path: d.path } : {}),
  value: d.value,
  ...(d.unit !== undefined ? { unit: d.unit } : {}),
  ...(d.recordedAt !== undefined ? { recordedAt: d.recordedAt } : {}),
  source: where,
  confidence: d.confidence,
  reason,
});

/**
 * The reader reads the mapped model; its vetoes leave the accepted proposals, and the draft
 * is rebuilt from what remains plus its decisions and the values a person confirmed, so a
 * vetoed passport id falls back too.
 */
export async function readModel(
  modelId: string,
  m: MappedModel,
  o: RunModelOptions,
  reader: Reader | undefined,
): Promise<MappedModel & { reading: ReadingSummary }> {
  if (!reader) throw new Error(`model ${modelId}: AI reading is on but no reader is configured`);
  o.onStep?.({ step: 'read', facts: m.facts, mapped: m.mapped });
  const r = await inStep(modelId, 'read', () =>
    reader.read({
      category: o.category,
      bundle: m.bundle,
      facts: m.factSet.facts,
      draft: m.draft,
      open: openTargets(m.draft, o.asOf),
      accepted: m.accepted,
    }),
  );
  const vetoed = new Set(r.vetoed);
  const accepted = m.accepted.filter((p) => !vetoed.has(slotKey(p)));
  const result = await inStep(modelId, 'read', () =>
    applyMappings(
      newDraft({
        schemaVersion: SCHEMA_VERSION,
        category: o.category,
        passportId: passportIdOf(modelId, accepted),
        createdAt: o.asOf,
      }),
      [...accepted.map(decisionOf), ...r.decisions, ...r.confirmed.map(confirmedDecision)],
    ),
  );
  return {
    ...m,
    accepted,
    draft: result.draft,
    conflicts: result.conflicts,
    mapped: presentCount(result.draft),
    reading: {
      applied: r.decisions.length,
      confirmed: r.confirmed.length,
      toConfirm: r.held.map(proposalOf),
      vetoed: r.vetoed.length,
      inputTokens: r.inputTokens,
      requests: r.requests,
    },
  };
}

const RANK: Record<Verdict, number> = { valid: 0, valid_with_warnings: 1, invalid: 2 };

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

async function digest(file: string, bytes: Uint8Array): Promise<ArtefactDigest> {
  return { file, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) };
}

/**
 * Runs one model through ingest, extract, suggest, apply, validate and emit, with the AI
 * reading step after apply when `o.read` is set.
 */
export async function runModel(
  model: SeriesModel,
  o: RunModelOptions,
  reader?: Reader,
): Promise<ModelOutcome> {
  const { modelId } = model;
  const automatic = await mapModel(model, o);
  const read = o.read ? await readModel(modelId, automatic, o, reader) : undefined;
  const mapped = read ?? automatic;
  const { draft, facts, mapped: present } = mapped;
  o.onStep?.({ step: 'validate', facts, mapped: present });
  const asOf = { asOf: o.asOf };
  const report = await inStep(modelId, 'validate', () => validate(draft, asOf));

  o.onStep?.({ step: 'emit', facts, mapped: present });
  const emitted = await inStep(modelId, 'emit', () => {
    const json = emitAasJson(draft, asOf);
    const aasx = emitAasx(draft, asOf);
    const html = emitHtml(draft, { ...asOf, lang: 'en' });
    const gap = gapReport(draft, { report, ...asOf });
    return { json, aasx, html, gap };
  });

  // Emitters re-validate their own output; the outcome is never better than any of them.
  let worst: { verdict: Verdict; findings: Finding[] } = report;
  for (const r of [emitted.json, emitted.aasx, emitted.html]) {
    if (RANK[r.verdict] > RANK[worst.verdict]) worst = r;
  }

  const artefacts = await Promise.all([
    digest(`${modelId}.aas.json`, utf8(emitted.json.output)),
    digest(`${modelId}.aasx`, emitted.aasx.output),
    digest(`${modelId}.html`, utf8(emitted.html.output)),
    digest(`${modelId}.gaps.json`, utf8(canonicalJson(emitted.gap))),
  ]);

  return {
    modelId,
    verdict: worst.verdict,
    facts,
    proposals: mapped.proposals.length,
    accepted: mapped.accepted.length,
    mapped: present,
    conflicts: mapped.conflicts.length,
    findings: {
      errors: worst.findings.filter((f) => f.severity === 'error').length,
      warnings: worst.findings.filter((f) => f.severity === 'warning').length,
    },
    gap: {
      mandatoryCompleteness: Number(emitted.gap.completeness.mandatory.percent),
      missingRequired: emitted.gap.items
        .filter((i) => i.bucket === 'required' && i.status !== 'present')
        .map((i) => i.attributeId)
        .sort(byCodePoint),
    },
    artefacts,
    ...(read ? { reading: read.reading } : {}),
  };
}
