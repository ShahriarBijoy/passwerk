import { COMPOSITE_SCHEMAS } from '@passwerk/core';

/**
 * The slice of a Zod schema this app uses. Structural, so `apps/web` needs no direct `zod`
 * dependency of its own: core owns the schemas and the version they are written against.
 */
export interface LeafSchema {
  safeParse(
    value: unknown,
  ): { success: true } | { success: false; error: { issues: { message: string }[] } };
}

/**
 * Zod 4 keeps its definition under `_zod.def`; the same walk core's `applyMappings` uses to
 * check a composite path (`packages/core/src/mapping/apply.ts`). Only the members this app
 * needs are named.
 */
interface ZodDef {
  type: string;
  innerType?: unknown;
  shape?: Record<string, unknown>;
  valueType?: unknown;
  element?: unknown;
}

const defOf = (node: unknown): ZodDef => (node as { _zod: { def: ZodDef } })._zod.def;

/** Step past optional / nullable / default wrappers to the schema they carry. */
function unwrap(node: unknown): { node: unknown; def: ZodDef } {
  let current = node;
  let def = defOf(current);
  while (def.type === 'optional' || def.type === 'nullable' || def.type === 'default') {
    current = def.innerType;
    def = defOf(current);
  }
  return { node: current, def };
}

const CONTAINERS = new Set(['object', 'record', 'array', 'tuple']);

/**
 * The two languages every user-facing string in this project exists in. A `z.record` leaf (a
 * multilingual text) has open keys, so these are the ones a reviewer can be offered by name.
 */
const LANGUAGE_KEYS = ['de', 'en'] as const;

/** Guard against a schema that nests into itself; nothing in core goes this deep. */
const MAX_DEPTH = 6;

/**
 * The schema for one scalar leaf of a composite, addressed by a dotted path, or `null` when
 * the path names nothing the composite declares, stops on a sub-object, or walks into an
 * array. Repeated rows are not entered field by field in this slice.
 */
export function leafSchemaAt(attributeId: string, path: string): LeafSchema | null {
  const schema = COMPOSITE_SCHEMAS[attributeId];
  if (!schema) return null;
  let cursor: unknown = schema;
  const segments = path.split('.');
  if (segments.length > MAX_DEPTH) return null;
  for (const segment of segments) {
    if (segment.length === 0) return null;
    const { def } = unwrap(cursor);
    if (def.type === 'object') {
      const shape = def.shape ?? {};
      if (!Object.hasOwn(shape, segment)) return null;
      cursor = shape[segment];
      continue;
    }
    if (def.type === 'record') {
      cursor = def.valueType;
      continue;
    }
    return null;
  }
  const { node, def } = unwrap(cursor);
  return CONTAINERS.has(def.type) ? null : (node as LeafSchema);
}

/**
 * Dotted paths to every scalar leaf a composite declares, in schema order. A composite that
 * is a list of rows has none: those are not entered field by field here.
 */
export function compositeLeafPaths(attributeId: string): string[] {
  const schema = COMPOSITE_SCHEMAS[attributeId];
  if (!schema) return [];
  const out: string[] = [];
  const walk = (node: unknown, prefix: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    const { def } = unwrap(node);
    if (def.type === 'object') {
      for (const [key, child] of Object.entries(def.shape ?? {})) {
        walk(child, prefix === '' ? key : `${prefix}.${key}`, depth + 1);
      }
      return;
    }
    if (def.type === 'record') {
      for (const key of LANGUAGE_KEYS) walk(def.valueType, `${prefix}.${key}`, depth + 1);
      return;
    }
    if (CONTAINERS.has(def.type)) return;
    if (prefix !== '') out.push(prefix);
  };
  walk(schema, '', 0);
  return out;
}

/** A composite whose value is a list of rows rather than a set of named fields. */
export function isArrayComposite(attributeId: string): boolean {
  const schema = COMPOSITE_SCHEMAS[attributeId];
  return schema !== undefined && unwrap(schema).def.type === 'array';
}
