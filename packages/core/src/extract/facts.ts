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

/** Internal draft, prior to dedup and id assignment. `labelKey` and `dedupeSuffix` are computed
 * at draft-creation time (shape-aware: rule 3 for header-cell facts) rather than generically
 * derived later. Optional-ish fields are always present (possibly undefined) rather than `?:`
 * so building the object never fights `exactOptionalPropertyTypes`; the final `Fact` uses
 * conditional spread instead. */
interface Draft {
  label: string;
  labelKey: string;
  raw: string;
  shape: Fact['shape'];
  rowLabel: string | undefined;
  /** Third segment of the dedupe key: `rowLabel`, or `R<n>` for a row-numbered header-cell fact
   * with no row label (rule: two BOM-style rows with no label must not collide), or '' otherwise. */
  dedupeSuffix: string;
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

/** A non-empty cell that isn't a number or a date: usable as a row label or as a pair-like
 * table's first column. A digit alone doesn't disqualify a cell: chemistry/part names like
 * "NMC811", "LiPF6" or "CAS 7782-42-5" are labels, not numbers, so the test is whether the
 * cell parses as a number (or is typed as one), not whether it merely contains a digit. */
function isLabelCell(c: Cell | undefined, lang: Lang): c is Cell {
  return (
    !!c &&
    c.text.length > 0 &&
    c.kind !== 'number' &&
    c.kind !== 'date' &&
    parseNumber(c.text, lang) === undefined
  );
}

/** A stricter "this is not a value" test than `isLabelCell`, used only to decide whether a row
 * is a text header row: on top of `isLabelCell`'s number/date exclusion, a cell that is itself a
 * date written as text (e.g. an XLSX mirror line) or a URI (e.g. a passport link) is a value,
 * not a header label -- unlike a bare digit, neither is ambiguous with a label like "NMC811". */
function looksLikeHeaderCell(c: Cell, lang: Lang): boolean {
  return (
    c.text.length === 0 ||
    (isLabelCell(c, lang) && parseDate(c.text) === undefined && !isUri(c.text))
  );
}

/** The first row is all-text with at least two populated cells (candidate column headers). No
 * width floor: a width-2 table can be a header table too (e.g. a "Nr | Wert" table). */
function isTextHeaderRow(header: Cell[], lang: Lang): boolean {
  const populated = header.filter((c) => c.text.length > 0);
  return header.every((c) => looksLikeHeaderCell(c, lang)) && populated.length >= 2;
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
  const headerIsText = isTextHeaderRow(header, page.lang);
  const dataRows = headerIsText ? rows.slice(1) : rows;
  // A text header row with nothing beneath it (just a header, no data) yields no facts at all.
  if (headerIsText && dataRows.length === 0) return out;

  const pairLike =
    (width === 2 || width === 3) &&
    rows.every((r) => isLabelCell(r[0], page.lang)) &&
    // A width-2 table with a genuine text header (e.g. "Material | Masse [kg]") describes real
    // columns applying to every row below it, so a single non-numeric-labelled data row must
    // not be mistaken for a one-off label:value pair -- that would fold the whole table into one
    // fact and lose the column name. Width 3's extra unit-column check below already guards the
    // equivalent case (Leistung, the CSV) by requiring dataRows' third column to be a real unit,
    // so headerIsText and pairLike may coexist there; width 2 has no such extra signal.
    (width !== 2 || !headerIsText) &&
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
        labelKey: normalizeLabel(label.text),
        raw: value.text,
        shape: 'sheet-pair',
        rowLabel: undefined,
        dedupeSuffix: '',
        source: value.source,
        unitHint,
        cellKind: value.kind,
      });
    }
  }

  if (headerIsText) {
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
      dataRows.forEach((r, ri) => {
        const rowLabel = isLabelCell(r[0], page.lang) ? r[0]?.text : undefined;
        const rowNumber = ri + 1;
        r.forEach((cell, ci) => {
          const columnHeader = headers[ci];
          if (!columnHeader || cell.text.length === 0 || (ci === 0 && rowLabel !== undefined))
            return;
          // Rule 3: a row-labelled header-cell fact's labelKey folds the row label in, so
          // e.g. "Kobalt"+"Post-Consumer" and "Lithium"+"Post-Consumer" don't collide; the
          // header-as-written stays the fact's `label`. A row with no label (e.g. a BOM row
          // whose first cell contains a digit) instead gets its 1-based row number folded into
          // the dedupe key alone, so two such rows sharing a header and value both survive.
          out.push({
            label: columnHeader,
            labelKey:
              rowLabel !== undefined
                ? normalizeLabel(`${rowLabel} ${columnHeader}`)
                : normalizeLabel(columnHeader),
            raw: cell.text,
            shape: 'header-cell',
            rowLabel,
            dedupeSuffix: rowLabel ?? `R${rowNumber}`,
            source: cell.source,
            unitHint: unitFromLabel(columnHeader),
            cellKind: cell.kind,
          });
        });
      });
    }
  }
  return out;
}

export function extractFacts(bundle: DocumentBundle): FactSet {
  const facts: Fact[] = [];
  const tables: TableFact[] = [];
  for (const doc of bundle.documents) {
    for (const page of doc.pages) {
      // Colon `kv` facts and every table-derived fact are strong; a colon-less two-segment line
      // yields a weak draft. Strong drafts are deduped first (lines before tables, so a real kv
      // line wins over its mirrored table row); a weak draft is then added only if its key was
      // not already claimed by a strong fact, and weak drafts also dedupe among themselves.
      const strongDrafts: Draft[] = [];
      const weakDrafts: Draft[] = [];
      for (const line of page.lines) {
        const m = KV_LINE.exec(line.text);
        if (m) {
          const label = (m[1] as string).trim();
          strongDrafts.push({
            label,
            labelKey: normalizeLabel(label),
            raw: (m[2] as string).trim(),
            shape: 'kv',
            rowLabel: undefined,
            dedupeSuffix: '',
            source: line.source,
            unitHint: undefined,
            cellKind: undefined,
          });
        } else if (line.segments.length === 2 && !hasDigit(line.segments[0] as string)) {
          const label = line.segments[0] as string;
          weakDrafts.push({
            label,
            labelKey: normalizeLabel(label),
            raw: line.segments[1] as string,
            shape: 'kv',
            rowLabel: undefined,
            dedupeSuffix: '',
            source: line.source,
            unitHint: undefined,
            cellKind: undefined,
          });
        }
      }
      for (const table of page.tables) strongDrafts.push(...tableDrafts(table, page, tables, doc));

      const seen = new Set<string>();
      let n = 0;
      const accept = (d: Draft) => {
        const key = `${d.labelKey}|${d.raw}|${d.dedupeSuffix}`;
        if (d.labelKey.length === 0 || d.raw.length === 0 || seen.has(key)) return;
        seen.add(key);
        n += 1;
        const interpreted = interpretValue(d.raw, page.lang, d.unitHint, d.cellKind);
        facts.push({
          id: `${doc.name}#${page.number}:${n}`,
          label: d.label,
          labelKey: d.labelKey,
          raw: d.raw,
          ...interpreted,
          lang: page.lang,
          shape: d.shape,
          ...(d.rowLabel !== undefined ? { rowLabel: d.rowLabel } : {}),
          source: d.source,
        });
      };
      for (const d of strongDrafts) accept(d);
      for (const d of weakDrafts) accept(d);
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
