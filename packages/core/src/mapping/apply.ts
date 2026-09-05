import { getAttribute } from '@passwerk/rules';
import type { z } from 'zod';
import { canonicalJson } from '../emit/canonical.js';
import { COMPOSITE_SCHEMAS } from '../model/composites.js';
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

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

const pathError = (path: string, why: string) =>
  new Error(`@passwerk/core: applyMappings: invalid composite path "${path}": ${why}`);

/**
 * Split a composite path into segments and refuse anything that could reach the prototype
 * chain (issue #10): empty segments and `__proto__` / `prototype` / `constructor`. Exported so
 * plain-JavaScript callers of `setPath` get the same protection as the Zod input schema.
 */
export function parsePath(path: string): string[] {
  const parts = path.split('.');
  for (const part of parts) {
    if (part.length === 0) throw pathError(path, 'empty segment');
    if (FORBIDDEN_SEGMENTS.has(part)) throw pathError(path, `segment "${part}" is not allowed`);
  }
  return parts;
}

interface ZodDef {
  type: string;
  innerType?: unknown;
  shape?: Record<string, unknown>;
  valueType?: unknown;
  element?: unknown;
}
const defOf = (node: unknown): ZodDef => (node as { _zod: { def: ZodDef } })._zod.def;

/** Zod 4 def walk: does `segments` name a leaf (or sub-object) the composite schema declares? */
function assertPathInShape(schema: z.ZodType, path: string, segments: string[]): void {
  let node: unknown = schema;
  for (const part of segments) {
    let def = defOf(node);
    // Unwrap optional / nullable / default wrappers before looking at the shape.
    while (def.type === 'optional' || def.type === 'nullable' || def.type === 'default') {
      def = defOf(def.innerType);
    }
    switch (def.type) {
      case 'object': {
        const shape = def.shape ?? {};
        if (!Object.hasOwn(shape, part))
          throw pathError(path, `"${part}" is not a field of this composite`);
        node = shape[part];
        break;
      }
      case 'record':
        node = def.valueType;
        break;
      case 'array':
        if (!/^\d+$/.test(part)) throw pathError(path, `"${part}" is not an array index`);
        node = def.element;
        break;
      default:
        throw pathError(path, `"${part}" goes below a leaf value`);
    }
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read `segments` out of a value; `undefined` when any step is missing. Own properties only. */
export function getPath(target: unknown, segments: string[]): unknown {
  let cursor: unknown = target;
  for (const part of segments) {
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(part)];
      continue;
    }
    if (!isPlainObject(cursor) || !Object.hasOwn(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/**
 * Deep-set `path` ("address.cityTown") inside a plain object copy. Only own properties are
 * traversed and every segment goes through `parsePath`, so no path can write to the prototype
 * chain (issue #10).
 */
export function setPath(target: unknown, path: string, value: unknown): Record<string, unknown> {
  const parts = parsePath(path);
  const root: Record<string, unknown> = isPlainObject(target) ? structuredClone(target) : {};
  let cursor: Record<string, unknown> = root;
  for (const part of parts.slice(0, -1)) {
    const next = Object.hasOwn(cursor, part) ? cursor[part] : undefined;
    const child: Record<string, unknown> = isPlainObject(next) ? next : {};
    cursor[part] = child;
    cursor = child;
  }
  cursor[parts[parts.length - 1] as string] = value;
  return root;
}

function checkLeaf(id: string, decision: MappingDecision): void {
  const attribute = getAttribute(id);
  if (!attribute) throw new Error(`@passwerk/core: applyMappings: unknown attribute id ${id}`);
  if (attribute.valueKind === 'composite') {
    // Partial objects are checked by L1 once complete; here only the path itself is checked:
    // safe segments (issue #10) that the composite's declared shape actually has.
    if (decision.path !== undefined) {
      const segments = parsePath(decision.path);
      const schema = COMPOSITE_SCHEMAS[id];
      if (schema) assertPathInShape(schema, decision.path, segments);
    }
    return;
  }
  if (decision.path !== undefined) {
    throw new Error(
      `@passwerk/core: applyMappings: ${id}: a path decision targets a composite sub-field, but ${id} is not a composite attribute`,
    );
  }
  const r = valueSchemaFor(attribute).safeParse(decision.value);
  if (!r.success)
    throw new Error(
      `@passwerk/core: applyMappings: ${id}: ${r.error.issues.map((i) => i.message).join('; ')}`,
    );
}

/**
 * Spec 6.5: pure, deterministic, idempotent; conflicts are flagged, never overwritten silently.
 *
 * `path` decisions build a composite incrementally, leaf by leaf. A leaf that is still missing
 * is filled; an identical leaf merges provenance; a **different** value for an already-set leaf
 * is a conflict carrying the `path` (issue #13) and leaves the existing value in place. Only
 * `override: true` replaces a leaf, and doing so resolves the attribute back to `present`.
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
    const merged = mergeSources(existing?.source ?? [], incomingSources);

    if (d.path !== undefined) {
      const segments = parsePath(d.path);
      const current = getPath(existing?.value, segments);
      if (current !== undefined && same(current, d.value)) {
        attributes[d.attributeId] = { ...(existing as AnyFieldValue), source: merged };
        continue;
      }
      if (current !== undefined && !d.override) {
        conflicts.push({
          attributeId: d.attributeId,
          path: d.path,
          existing: current,
          incoming: d.value,
          source: incomingSources,
        });
        attributes[d.attributeId] = {
          ...(existing as AnyFieldValue),
          status: 'conflict',
          source: merged,
        };
        continue;
      }
      // Filling a missing leaf keeps an unresolved conflict on another leaf unresolved; an
      // explicit override is the resolution and restores `present`.
      const status: AnyFieldValue['status'] =
        !d.override && existing?.status === 'conflict' ? 'conflict' : 'present';
      attributes[d.attributeId] = fresh(setPath(existing?.value, d.path, d.value), status, merged);
      applied += 1;
      continue;
    }

    if (!existing || existing.value === undefined || d.override) {
      attributes[d.attributeId] = fresh(d.value, 'present', merged);
      applied += 1;
      continue;
    }
    if (same(existing.value, d.value)) {
      attributes[d.attributeId] = { ...existing, source: merged };
      continue;
    }
    conflicts.push({
      attributeId: d.attributeId,
      existing: existing.value,
      incoming: d.value,
      source: incomingSources,
    });
    attributes[d.attributeId] = { ...existing, status: 'conflict', source: merged };
  }
  return {
    draft: { meta: draft.meta, attributes: attributes as PassportDraft['attributes'] },
    applied,
    conflicts,
  };
}
