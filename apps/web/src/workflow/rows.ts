import { arrayElementLeaves, compositeSchemaOf, type ElementLeaf } from './compositeSchema.ts';

/** One row as the reviewer types it: scalar and list leaves as text, nested rows by leaf path. */
export interface RowDraft {
  fields: Record<string, string>;
  nested: Record<string, RowDraft[]>;
}

export const emptyRow = (): RowDraft => ({ fields: {}, nested: {} });

function setAt(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== 'object' || next === null) {
      const fresh: Record<string, unknown> = {};
      cursor[part] = fresh;
      cursor = fresh;
    } else {
      cursor = next as Record<string, unknown>;
    }
  }
  cursor[parts[parts.length - 1] ?? ''] = value;
}

function getAt(source: unknown, path: string): unknown {
  let cursor: unknown = source;
  for (const part of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function buildRow(leaves: ElementLeaf[], row: RowDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const leaf of leaves) {
    if (leaf.kind === 'rows') {
      const nested = buildRows(leaf.rows ?? [], row.nested[leaf.path] ?? []);
      if (nested.length > 0) setAt(out, leaf.path, nested);
      continue;
    }
    const text = (row.fields[leaf.path] ?? '').trim();
    if (text === '') continue;
    if (leaf.kind === 'list') {
      const items = text
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
      if (items.length > 0) setAt(out, leaf.path, items);
    } else {
      setAt(out, leaf.path, text);
    }
  }
  return out;
}

/** Typed rows as the objects core's schema expects; blank leaves and empty sub-objects are left out. */
export function buildRows(leaves: ElementLeaf[], rows: RowDraft[]): unknown[] {
  return rows.map((row) => buildRow(leaves, row));
}

/** An existing array value (draft or earlier decision) as editable rows. Unknown keys are dropped. */
export function rowsFromValue(leaves: ElementLeaf[], value: unknown): RowDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = emptyRow();
    for (const leaf of leaves) {
      const v = getAt(item, leaf.path);
      if (v === undefined) continue;
      if (leaf.kind === 'rows') row.nested[leaf.path] = rowsFromValue(leaf.rows ?? [], v);
      else if (leaf.kind === 'list')
        row.fields[leaf.path] = Array.isArray(v) ? v.map(String).join(', ') : String(v);
      else row.fields[leaf.path] = String(v);
    }
    return row;
  });
}

export type RowsCheck =
  | { ok: true; value: unknown[] }
  | { ok: false; errors: { row: number; reason: string }[] };

/** Build and parse against core's composite schema; issues are attributed to their row index. */
export function checkRows(attributeId: string, rows: RowDraft[]): RowsCheck {
  const schema = compositeSchemaOf(attributeId);
  if (!schema)
    return { ok: false, errors: [{ row: 0, reason: `${attributeId} is not a composite` }] };
  const value = buildRows(arrayElementLeaves(attributeId), rows);
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      row: typeof i.path?.[0] === 'number' ? i.path[0] : 0,
      reason: `${i.path?.slice(1).join('.') ?? ''}${i.path && i.path.length > 1 ? ': ' : ''}${i.message}`,
    })),
  };
}
