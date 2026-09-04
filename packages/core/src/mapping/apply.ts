import { getAttribute } from '@passwerk/rules';
import { canonicalJson } from '../emit/canonical.js';
import type { AnyFieldValue } from '../model/field.js';
import { type PassportDraft, type PassportMeta, SCHEMA_VERSION } from '../model/passport.js';
import type { Provenance } from '../model/provenance.js';
import { valueSchemaFor } from '../model/values.js';
import type { ApplyResult, MappingConflict, MappingDecision } from './types.js';

export function newDraft(meta: PassportMeta): PassportDraft {
  return { meta: { ...meta, schemaVersion: SCHEMA_VERSION }, attributes: {} };
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

function mergeSources(existing: Provenance[], incoming: Provenance[]): Provenance[] {
  const out = [...existing];
  for (const p of incoming) if (!out.some((q) => same(q, p))) out.push(p);
  return out;
}

/** Deep-set `path` ("address.cityTown") inside a plain object copy. */
export function setPath(target: unknown, path: string, value: unknown): Record<string, unknown> {
  const root: Record<string, unknown> =
    typeof target === 'object' && target !== null
      ? structuredClone(target as Record<string, unknown>)
      : {};
  const parts = path.split('.');
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    cursor[part] =
      typeof next === 'object' && next !== null ? (next as Record<string, unknown>) : {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1] as string] = value;
  return root;
}

function checkLeaf(id: string, decision: MappingDecision): void {
  const attribute = getAttribute(id);
  if (!attribute) throw new Error(`@passwerk/core: applyMappings: unknown attribute id ${id}`);
  if (attribute.valueKind === 'composite') return; // partial objects are checked by L1 once complete
  const r = valueSchemaFor(attribute.valueKind).safeParse(decision.value);
  if (!r.success)
    throw new Error(
      `@passwerk/core: applyMappings: ${id}: ${r.error.issues.map((i) => i.message).join('; ')}`,
    );
}

/**
 * Spec 6.5: pure, deterministic, idempotent; conflicts are flagged, never overwritten silently.
 *
 * `path` decisions always merge into the existing composite value (built incrementally,
 * field by field) and never produce a conflict; a `path` decision that changes an
 * already-set sub-field simply overwrites that sub-field.
 */
export function applyMappings(draft: PassportDraft, decisions: MappingDecision[]): ApplyResult {
  const attributes: Record<string, AnyFieldValue> = structuredClone(
    draft.attributes as Record<string, AnyFieldValue>,
  );
  const conflicts: MappingConflict[] = [];
  let applied = 0;
  for (const d of decisions) {
    checkLeaf(d.attributeId, d);
    const incomingSources = d.source ?? [];
    const existing = attributes[d.attributeId];
    const incomingValue = d.path ? setPath(existing?.value, d.path, d.value) : d.value;
    const fresh = (
      value: unknown,
      status: AnyFieldValue['status'],
      sources: Provenance[],
    ): AnyFieldValue => ({
      value,
      status,
      source: sources,
      ...(d.unit ? { unit: d.unit } : existing?.unit ? { unit: existing.unit } : {}),
      ...(d.confidence !== undefined
        ? { confidence: d.confidence }
        : existing?.confidence !== undefined
          ? { confidence: existing.confidence }
          : {}),
      ...(d.recordedAt
        ? { recordedAt: d.recordedAt }
        : existing?.recordedAt
          ? { recordedAt: existing.recordedAt }
          : {}),
    });
    if (!existing || existing.value === undefined || d.path || d.override) {
      attributes[d.attributeId] = fresh(
        incomingValue,
        'present',
        mergeSources(existing?.source ?? [], incomingSources),
      );
      applied += 1;
      continue;
    }
    if (same(existing.value, incomingValue)) {
      attributes[d.attributeId] = {
        ...existing,
        source: mergeSources(existing.source, incomingSources),
      };
      continue;
    }
    conflicts.push({
      attributeId: d.attributeId,
      existing: existing.value,
      incoming: incomingValue,
      source: incomingSources,
    });
    attributes[d.attributeId] = {
      ...existing,
      status: 'conflict',
      source: mergeSources(existing.source, incomingSources),
    };
  }
  return {
    draft: { meta: draft.meta, attributes: attributes as PassportDraft['attributes'] },
    applied,
    conflicts,
  };
}
