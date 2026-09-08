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
    if (leaf.kind === 'list') {
      // One item per line, not comma-separated: an item can itself contain a comma (a
      // hazardous-substance impact sentence, for instance), and splitting on it would corrupt
      // that item on the very next save.
      const items = (row.fields[leaf.path] ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s !== '');
      if (items.length > 0) setAt(out, leaf.path, items);
      continue;
    }
    const text = (row.fields[leaf.path] ?? '').trim();
    if (text === '') continue;
    setAt(out, leaf.path, text);
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
        row.fields[leaf.path] = Array.isArray(v) ? v.map(String).join('\n') : String(v);
      else row.fields[leaf.path] = String(v);
    }
    return row;
  });
}

/**
 * `leaves`, extended with one scalar leaf for every extra language key some value in
 * `values` carries on a record-typed (multilingual) field beyond the schema's own `de`/`en`.
 * Core's `MultilingualText` is an open `z.record`, so an imported row can legitimately carry
 * `fr`, `es`, and so on: without this, the row editor would only ever show `de`/`en`, rebuild
 * the object from those two alone, and silently drop every other language on save.
 *
 * The union is taken across every row in `values` (a mixed batch shows every language any row
 * carries), `de` and `en` are always kept, and extras are appended sorted after them. A row
 * missing a language just renders that field blank, and blank still means "omit" on save, so
 * nothing is invented. Recurses into nested `rows` leaves against their own nested values.
 */
export function expandLeaves(leaves: ElementLeaf[], values: unknown[]): ElementLeaf[] {
  const out: ElementLeaf[] = [];
  const done = new Set<string>();
  for (const leaf of leaves) {
    if (leaf.kind === 'rows') {
      const nestedValues = values.flatMap((v) => {
        const nested = getAt(v, leaf.path);
        return Array.isArray(nested) ? nested : [];
      });
      out.push({ ...leaf, rows: expandLeaves(leaf.rows ?? [], nestedValues) });
      continue;
    }
    if (!leaf.lang) {
      out.push(leaf);
      continue;
    }
    const prefix = leaf.path.slice(0, leaf.path.lastIndexOf('.'));
    if (done.has(prefix)) continue;
    done.add(prefix);
    const extras = new Set<string>();
    for (const v of values) {
      const record = getAt(v, prefix);
      if (record !== null && typeof record === 'object' && !Array.isArray(record)) {
        for (const key of Object.keys(record as Record<string, unknown>)) {
          if (key !== 'de' && key !== 'en') extras.add(key);
        }
      }
    }
    for (const lang of ['de', 'en', ...[...extras].sort()]) {
      out.push({ path: `${prefix}.${lang}`, kind: 'scalar', required: false, lang: true });
    }
  }
  return out;
}

export type RowsCheck =
  | { ok: true; value: unknown[] }
  | { ok: false; errors: { row: number; reason: string }[] };

/** Build and parse against core's composite schema; issues are attributed to their row index. */
export function checkRows(
  attributeId: string,
  rows: RowDraft[],
  leaves: ElementLeaf[] = arrayElementLeaves(attributeId),
): RowsCheck {
  const schema = compositeSchemaOf(attributeId);
  if (!schema)
    return { ok: false, errors: [{ row: 0, reason: `${attributeId} is not a composite` }] };
  const value = buildRows(leaves, rows);
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
