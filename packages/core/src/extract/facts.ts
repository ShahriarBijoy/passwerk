import type { Cell, DocumentBundle, IngestedDocument, Lang, Page, Table } from '../ingest/types.js';
import type { Provenance } from '../model/provenance.js';
import { parseDate } from './dates.js';
import { normalizeLabel } from './normalize.js';
import { parseNumber } from './numbers.js';
import type { Fact, FactKind, FactSet, TableFact } from './types.js';
import { canonicalUnit, convertUnit, splitValueUnit, unitFromLabel } from './units.js';

const KV_LINE = /^(.{1,80}?:)\s+(.+)$/;
const hasDigit = (s: string) => /\d/.test(s);
const isUri = (s: string) => /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(s) && !/^\d/.test(s);

/** Internal draft, prior to dedup and id assignment. Optional-ish fields are always present
 * (possibly undefined) rather than `?:` so building the object never fights
 * `exactOptionalPropertyTypes`; the final `Fact` uses conditional spread instead. */
interface Draft {
  label: string;
  raw: string;
  shape: Fact['shape'];
  rowLabel: string | undefined;
  source: Provenance;
  unitHint: string | undefined;
  cellKind: Cell['kind'] | undefined;
}

function withUnit(
  value: string,
  kind: FactKind,
  unit: { unit: string; factor?: string } | undefined,
  rawUnit: string | undefined,
): Pick<Fact, 'value' | 'kind' | 'unit' | 'rawUnit'> {
  const out: Pick<Fact, 'value' | 'kind' | 'unit' | 'rawUnit'> = { value, kind };
  if (rawUnit) out.rawUnit = rawUnit;
  if (unit) {
    out.unit = unit.unit;
    if (unit.factor) {
      out.value = convertUnit(value, unit.factor);
      out.kind = out.value.includes('.') ? 'decimal' : 'integer';
    }
  }
  return out;
}

/** Turn raw text into value, kind and unit. Number cells from XLSX are trusted as canonical. */
export function interpretValue(
  raw: string,
  lang: Lang,
  unitHint?: string,
  cellKind?: Cell['kind'],
): Pick<Fact, 'value' | 'kind' | 'unit' | 'rawUnit'> {
  const text = raw.trim();
  if (cellKind === 'number') {
    const unit = unitHint ? canonicalUnit(unitHint) : undefined;
    return withUnit(text, text.includes('.') ? 'decimal' : 'integer', unit, unitHint);
  }
  if (cellKind === 'date' || parseDate(text)) {
    return { value: parseDate(text) ?? text, kind: 'date' };
  }
  const split = splitValueUnit(text);
  if (split.number) {
    const num = parseNumber(split.number, lang);
    if (num) {
      const rawUnit = split.unitRaw ?? unitHint;
      return withUnit(num.value, num.kind, rawUnit ? canonicalUnit(rawUnit) : undefined, rawUnit);
    }
  }
  if (/^(ja|nein|yes|no|true|false)$/i.test(text)) {
    return { value: /^(ja|yes|true)$/i.test(text) ? 'true' : 'false', kind: 'boolean' };
  }
  if (isUri(text)) return { value: text, kind: 'uri' };
  const out: Pick<Fact, 'value' | 'kind' | 'unit' | 'rawUnit'> = { kind: 'text' };
  if (text.length > 0) out.value = text;
  return out;
}

/** A non-empty, non-numeric cell: usable as a row label or as a pair-like table's first column. */
function isLabelCell(c: Cell | undefined): c is Cell {
  return !!c && c.text.length > 0 && !hasDigit(c.text) && c.kind !== 'number';
}

/** The first row is all-text with at least two populated cells (candidate column headers). */
function isTextHeaderRow(header: Cell[]): boolean {
  const populated = header.filter((c) => c.text.length > 0);
  return (
    header.every((c) => c.text.length === 0 || (!hasDigit(c.text) && c.kind !== 'number')) &&
    populated.length >= 2
  );
}

function tableDrafts(
  table: Table,
  page: Page,
  tables: TableFact[],
  doc: IngestedDocument,
): Draft[] {
  const out: Draft[] = [];
  const rows = table.rows.filter((r) => r.some((c) => c.text.length > 0));
  if (rows.length === 0) return out;
  const width = Math.max(...rows.map((r) => r.filter((c) => c.text.length > 0).length));
  const header = rows[0] as Cell[];
  // A width-2 vertical key/value list (the PDF's kv block, an XLSX Stammdaten sheet) is never
  // treated as a header table even when its first row happens to be text-only: it has no
  // distinct "header vs. data" shape, just N rows of the same kind.
  const isHeaderTable = width >= 3 && rows.length > 1 && isTextHeaderRow(header);
  const dataRows = isHeaderTable ? rows.slice(1) : rows;
  const pairLike =
    (width === 2 || width === 3) &&
    rows.every((r) => isLabelCell(r[0])) &&
    (width !== 3 ||
      dataRows.every((r) => {
        const unitCell = r[2];
        return (
          !unitCell || unitCell.text.length === 0 || canonicalUnit(unitCell.text) !== undefined
        );
      }));

  if (pairLike) {
    for (const r of dataRows) {
      const label = r[0];
      const value = r[1];
      const unitCell = r[2];
      if (!label || !value || value.text.length === 0) continue;
      const unitHint =
        unitCell && unitCell.text.length > 0 && canonicalUnit(unitCell.text)
          ? unitCell.text
          : unitFromLabel(label.text);
      out.push({
        label: label.text,
        raw: value.text,
        shape: 'sheet-pair',
        rowLabel: undefined,
        source: value.source,
        unitHint,
        cellKind: value.kind,
      });
    }
  }

  if (isHeaderTable) {
    const headers = header.map((c) => c.text);
    tables.push({
      id: `${doc.name}#${page.number}:T${table.index}`,
      headers,
      rows: dataRows.map((r) => r.map((c) => c.text)),
      source: table.source,
      lang: page.lang,
    });
    // Non-pair-like header tables also yield header-cell facts. Pair-like tables that are also
    // header tables (Leistung, the CSV) already got sheet-pair facts above; adding header-cell
    // facts too would just duplicate them under worse labels.
    if (!pairLike) {
      for (const r of dataRows) {
        const rowLabel = isLabelCell(r[0]) ? r[0]?.text : undefined;
        r.forEach((cell, ci) => {
          const columnHeader = headers[ci];
          if (!columnHeader || cell.text.length === 0 || (ci === 0 && rowLabel !== undefined))
            return;
          out.push({
            label: columnHeader,
            raw: cell.text,
            shape: 'header-cell',
            rowLabel,
            source: cell.source,
            unitHint: unitFromLabel(columnHeader),
            cellKind: cell.kind,
          });
        });
      }
    }
  }
  return out;
}

export function extractFacts(bundle: DocumentBundle): FactSet {
  const facts: Fact[] = [];
  const tables: TableFact[] = [];
  for (const doc of bundle.documents) {
    for (const page of doc.pages) {
      const drafts: Draft[] = [];
      for (const line of page.lines) {
        const m = KV_LINE.exec(line.text);
        if (m) {
          drafts.push({
            label: (m[1] as string).trim(),
            raw: (m[2] as string).trim(),
            shape: 'kv',
            rowLabel: undefined,
            source: line.source,
            unitHint: undefined,
            cellKind: undefined,
          });
        } else if (
          // A colon-less "label  value" line is only trusted as a fact of its own when the page
          // has no tables: xlsx/csv readers mirror every table row into `lines` too, and that
          // table row (with a real cell kind, unit and provenance) is the better source.
          page.tables.length === 0 &&
          line.segments.length === 2 &&
          !hasDigit(line.segments[0] as string)
        ) {
          drafts.push({
            label: line.segments[0] as string,
            raw: line.segments[1] as string,
            shape: 'kv',
            rowLabel: undefined,
            source: line.source,
            unitHint: undefined,
            cellKind: undefined,
          });
        }
      }
      for (const table of page.tables) drafts.push(...tableDrafts(table, page, tables, doc));

      const seen = new Set<string>();
      let n = 0;
      for (const d of drafts) {
        const labelKey = normalizeLabel(d.label);
        const key = `${labelKey}|${d.raw}|${d.rowLabel ?? ''}`;
        if (labelKey.length === 0 || d.raw.length === 0 || seen.has(key)) continue;
        seen.add(key);
        n += 1;
        const interpreted = interpretValue(d.raw, page.lang, d.unitHint, d.cellKind);
        facts.push({
          id: `${doc.name}#${page.number}:${n}`,
          label: d.label,
          labelKey,
          raw: d.raw,
          ...interpreted,
          lang: page.lang,
          shape: d.shape,
          ...(d.rowLabel !== undefined ? { rowLabel: d.rowLabel } : {}),
          source: d.source,
        });
      }
    }
  }
  const documents = bundle.documents.map((d) => ({
    name: d.name,
    format: d.format,
    contentType: d.contentType,
    lang: d.lang,
    pages: d.pages.length,
    sha256: d.sha256,
    ...(d.error ? { error: d.error } : {}),
  }));
  return { facts, tables, documents };
}
