import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Cell,
  type CellKind,
  type DocumentBundle,
  extractFacts,
  ingest,
  type Line,
  type Table,
} from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';

/** Build an in-memory Table (no file) for testing tableDrafts shapes directly. */
function mkTable(index: number, rows: string[][], kinds?: (CellKind | undefined)[][]): Table {
  const cells: Cell[][] = rows.map((row, ri) =>
    row.map((text, ci) => {
      const ref = `T${index}:R${ri + 1}C${ci + 1}`;
      const kind = kinds?.[ri]?.[ci];
      return kind
        ? { text, ref, kind, source: { file: 'inline', cell: ref } }
        : { text, ref, source: { file: 'inline', cell: ref } };
    }),
  );
  return { index, rows: cells, source: { file: 'inline' } };
}

function mkLine(text: string, segments: string[], note: string): Line {
  return { text, segments, source: { file: 'inline', note } };
}

/** Wrap tables/lines into a one-document, one-page bundle (no ingest() involved). */
function mkBundle(tables: Table[], lines: Line[] = []): DocumentBundle {
  return {
    documents: [
      {
        name: 'inline',
        format: 'txt',
        contentType: 'text/plain',
        sha256: '0'.repeat(64),
        lang: 'de',
        pages: [{ number: 1, lang: 'de', textless: false, lines, tables }],
      },
    ],
  };
}

const FIX = join(import.meta.dirname, 'fixtures', 'musterwerk');
const file = (name: string) => ({
  name,
  bytes: new Uint8Array(readFileSync(join(FIX, name))),
});
let bundle: DocumentBundle;
// PDF ingest on the Windows CI runner exceeded Vitest's 10 s default under Node 24 (2026-09-05).
beforeAll(async () => {
  bundle = await ingest(
    [
      'lieferantenerklaerung.pdf',
      'stueckliste.xlsx',
      'energierechnung.pdf',
      'datasheet-en.csv',
      'handover-notes.docx',
    ].map(file),
  );
}, 60_000);

const find = (facts: ReturnType<typeof extractFacts>['facts'], label: string, fileName?: string) =>
  facts.find((f) => f.label === label && (!fileName || f.source.file === fileName));

describe('extractFacts', () => {
  it('kv lines from the PDF: decimal comma, unit, provenance', () => {
    const { facts } = extractFacts(bundle);
    expect(find(facts, 'Nennkapazität:')).toMatchObject({
      labelKey: 'nennkapazitaet',
      raw: '94,5 Ah',
      value: '94.5',
      kind: 'decimal',
      unit: 'Ah',
      rawUnit: 'Ah',
      lang: 'de',
      shape: 'kv',
      source: { file: 'lieferantenerklaerung.pdf', page: 1, note: 'line 6' },
    });
    expect(find(facts, 'Herstellungsdatum:')).toMatchObject({ value: '2026-02-10', kind: 'date' });
    expect(find(facts, 'Garantiezeit:')).toMatchObject({
      value: '96',
      kind: 'integer',
      unit: 'months',
    });
    expect(find(facts, 'Hersteller:')).toMatchObject({
      value: 'Musterwerk Batteriesysteme GmbH',
      kind: 'text',
    });
  });
  it('header-cell facts from the PDF table carry column and row labels', () => {
    const { facts } = extractFacts(bundle);
    const cobaltPost = facts.find(
      (f) => f.shape === 'header-cell' && f.rowLabel === 'Kobalt' && f.label === 'Post-Consumer',
    );
    expect(cobaltPost).toMatchObject({
      value: '12.5',
      unit: '%',
      source: {
        file: 'lieferantenerklaerung.pdf',
        page: 1,
        cell: expect.stringMatching(/^T\d+:R2C2$/),
      },
    });
    // Ruling 3: labelKey folds the row label in, so same-header facts on different rows don't
    // collapse to the same key ('post consumer' for every row's Post-Consumer fact).
    expect(cobaltPost?.labelKey).toBe('kobalt post consumer');
    const lithiumPost = facts.find(
      (f) => f.shape === 'header-cell' && f.rowLabel === 'Lithium' && f.label === 'Post-Consumer',
    );
    expect(lithiumPost?.labelKey).toBe('lithium post consumer');
    expect(lithiumPost?.labelKey).not.toBe(cobaltPost?.labelKey);
  });
  it('a width-2 header table (no width floor) yields header-cell facts, not sheet-pair', () => {
    // "Nr | Wert" with numeric first cells in the data rows: headerIsText is true regardless of
    // width, but pairLike is false (the data rows' first cell is not a label), so this becomes
    // header-cell facts for both columns rather than being skipped or misread as sheet-pair.
    const table = mkTable(1, [
      ['Nr', 'Wert'],
      ['1', '94,5'],
      ['2', '12'],
    ]);
    const { facts } = extractFacts(mkBundle([table]));
    const nrFacts = facts.filter((f) => f.label === 'Nr');
    const wertFacts = facts.filter((f) => f.label === 'Wert');
    expect(nrFacts.map((f) => f.raw)).toEqual(['1', '2']);
    expect(wertFacts.map((f) => f.value)).toEqual(['94.5', '12']);
    expect(facts.some((f) => f.shape === 'sheet-pair')).toBe(false);
    expect(facts.every((f) => f.shape === 'header-cell')).toBe(true);
  });
  it('a colon-less two-segment line is a weak draft, added only if unclaimed by a strong fact', () => {
    // Note: uses "Gewicht:" rather than the illustrative "A:" from the finding, since "a" is a
    // normalizeLabel stopword and would make the label's labelKey empty (dropping the fact
    // entirely, which would defeat the point of this test).
    const table = mkTable(1, [['Gewicht:', '1']]);
    const lines = [
      mkLine('Gewicht:  1', ['Gewicht:', '1'], 'line 1'),
      mkLine('Gesamtgewicht  412,7 kg', ['Gesamtgewicht', '412,7 kg'], 'line 2'),
    ];
    const { facts } = extractFacts(mkBundle([table], lines));
    // The mirrored "Gewicht:" line (strong, colon-based) and the pair-like table's "Gewicht:"
    // row (strong, table-derived) share a dedupe key; lines are processed first, so exactly one
    // survives.
    expect(facts.filter((f) => f.label === 'Gewicht:')).toHaveLength(1);
    // "Gesamtgewicht" has no colon and no table counterpart: its weak draft is unclaimed and
    // survives as an ordinary kv fact.
    expect(facts.find((f) => f.label === 'Gesamtgewicht')).toMatchObject({
      value: '412.7',
      unit: 'kg',
      shape: 'kv',
    });
  });
  it('header-cell facts without a row label use the row number to avoid a dedupe collision', () => {
    // Both first cells are pure numbers ('1', '2'), which is never a row label (unlike a
    // digit-bearing material name such as "NMC811" -- see the isLabelCell tests below), so
    // neither row gets a row label; without folding the row number into the dedupe key, the two
    // identical ('kobalt rec', '0', '') keys would collapse to a single fact.
    const table = mkTable(1, [
      ['Position', 'Kobalt rec. %'],
      ['1', '0'],
      ['2', '0'],
    ]);
    const { facts } = extractFacts(mkBundle([table]));
    const kobalt = facts.filter((f) => f.label === 'Kobalt rec. %');
    expect(kobalt).toHaveLength(2);
    expect(kobalt.every((f) => f.rowLabel === undefined)).toBe(true);
  });
  it('a row label may contain a digit: a chemistry/part name folds into the header-cell labelKey', () => {
    // Width 3, not 2: the existing width-3 unit-column check ("Masse [kg]" -> '118.4' is not a
    // canonical unit) is what keeps this a header table instead of pair-like, so this doesn't
    // need (and mustn't need) a width-2-specific carve-out -- see the regression test below for
    // why a width-2 table must stay pair-like unconditionally.
    const table = mkTable(
      1,
      [
        ['Material', 'CAS-Nr.', 'Masse [kg]'],
        ['Kathodenaktivmaterial NMC811', '-', '118.4'],
      ],
      [
        [undefined, undefined, undefined],
        [undefined, undefined, 'number'],
      ],
    );
    const { facts } = extractFacts(mkBundle([table]));
    const masse = facts.find((f) => f.label === 'Masse [kg]');
    expect(masse).toMatchObject({
      shape: 'header-cell',
      rowLabel: 'Kathodenaktivmaterial NMC811',
      labelKey: 'kathodenaktivmaterial nmc811 masse',
      value: '118.4',
      unit: 'kg',
    });
  });
  it('a width-2 table with a text header stays pair-like (no width-2 carve-out)', () => {
    // Regression test: the PDF's mirrored key-value table is exactly this shape (a two-column
    // "Feld: | Wert" table with several rows, each a colon-terminated label). A width-2 header
    // table must fold into sheet-pair facts per row, never header-cell facts that fold the first
    // data row's label into every other row's labelKey.
    const table = mkTable(1, [
      ['Hersteller:', 'Musterwerk GmbH'],
      ['Herstellernummer:', 'DE-MW-0001'],
      ['Zellchemie:', 'NMC811'],
    ]);
    const { facts } = extractFacts(mkBundle([table]));
    expect(facts.filter((f) => f.shape === 'sheet-pair')).toHaveLength(3);
    expect(facts.filter((f) => f.shape === 'header-cell')).toHaveLength(0);
    expect(find(facts, 'Hersteller:')).toMatchObject({
      shape: 'sheet-pair',
      value: 'Musterwerk GmbH',
    });
  });
  it('a digit-bearing label still yields sheet-pair facts in a genuine pair-like table', () => {
    const table = mkTable(1, [
      ['NMC811', '94.5'],
      ['LiPF6', '22.1'],
    ]);
    const { facts } = extractFacts(mkBundle([table]));
    expect(facts.filter((f) => f.shape === 'sheet-pair')).toHaveLength(2);
    expect(find(facts, 'NMC811')).toMatchObject({ shape: 'sheet-pair', value: '94.5' });
    expect(find(facts, 'LiPF6')).toMatchObject({ shape: 'sheet-pair', value: '22.1' });
  });
  it('a numeric first column still has no row labels', () => {
    const table = mkTable(1, [
      ['Nr', 'Wert'],
      ['1', '94,5'],
      ['2', '12'],
    ]);
    const { facts } = extractFacts(mkBundle([table]));
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.rowLabel === undefined)).toBe(true);
  });
  it('a text header row with no data rows yields no facts', () => {
    const table = mkTable(1, [['Kenngröße', 'Wert', 'Einheit']]);
    const { facts, tables } = extractFacts(mkBundle([table]));
    expect(facts).toHaveLength(0);
    expect(tables).toHaveLength(0);
  });
  it('sheet pairs from XLSX: number cells are canonical, unit from the label, date cells', () => {
    const { facts } = extractFacts(bundle);
    expect(find(facts, 'Nennenergie [kWh]')).toMatchObject({
      value: '33.6',
      unit: 'kWh',
      shape: 'sheet-pair',
      source: { file: 'stueckliste.xlsx', page: 1, cell: 'Stammdaten!B4' },
    });
    expect(find(facts, 'Inbetriebnahme')).toMatchObject({ value: '2026-03-01', kind: 'date' });
    expect(find(facts, 'Batteriepass-ID')).toMatchObject({ kind: 'uri' });
  });
  it('three-column label/value/unit sheets take the unit from the third column', () => {
    const { facts } = extractFacts(bundle);
    // NOTE: the brief's test searched for 'Selbstentladungsrate', which is not the fixture's
    // label ('Aktuelle Selbstentladung' per tools/fixtures/src/content.ts LEISTUNG_ROWS).
    // Corrected to match the actual fixture content (see task-9-report.md).
    expect(find(facts, 'Aktuelle Selbstentladung')).toMatchObject({
      value: '1.1',
      unit: '%/month',
      source: { cell: 'Leistung!B5' },
    });
    expect(find(facts, 'Anzahl Vollzyklen')).toMatchObject({ value: '142', unit: 'cycles' });
  });
  it('the BOM becomes a TableFact and header-cell facts', () => {
    const { tables, facts } = extractFacts(bundle);
    // NOTE: the brief's test assumed a leading 'Position' column (headers[1] === 'Material',
    // a 5-cell row, cell 'Stückliste!E2'). Task 2 deviated from that draft and shipped
    // BOM_HEADER without a Position column (see task-2-report.md), so the current fixture's
    // BOM sheet has Material in column A. Corrected accordingly (see task-9-report.md).
    const bom = tables.find((t) => t.headers[0] === 'Material')!;
    expect(bom.rows[0]).toEqual(['Kathodenaktivmaterial NMC811', '-', '118.4', '12.5']);
    // "Kathodenaktivmaterial NMC811" contains a digit but is not a number, so it IS a row label
    // (isLabelCell tests a cell's content, not whether it merely contains a digit); the
    // header-cell fact's labelKey folds it in, so this per-component cobalt share doesn't
    // collide, under a bare "kobalt rec" labelKey, with the pack-level recycled-content
    // attributes' synonyms.
    expect(
      facts.find(
        (f) =>
          f.label === 'Kobalt rec. %' &&
          f.rowLabel === 'Kathodenaktivmaterial NMC811' &&
          f.source.cell === 'Stückliste!D2',
      ),
    ).toMatchObject({
      value: '12.5',
      unit: '%',
      labelKey: 'kathodenaktivmaterial nmc811 kobalt rec',
    });
  });
  it('CSV in English: thousands and decimal handled per page language', () => {
    const { facts } = extractFacts(bundle);
    expect(find(facts, 'Rated energy')).toMatchObject({
      value: '33.6',
      unit: 'kWh',
      rawUnit: 'Wh',
      lang: 'en',
    });
    expect(find(facts, 'Temperature range – idle, lower')).toMatchObject({
      value: '-20',
      unit: 'degC',
    });
  });
  it('unknown units are kept raw without a canonical unit', () => {
    const { facts } = extractFacts(bundle);
    expect(find(facts, 'Rechnungsbetrag:')).toMatchObject({ value: '13746.43', rawUnit: 'EUR' });
    expect(find(facts, 'Rechnungsbetrag:')!.unit).toBeUndefined();
  });
  it('fact ids are stable and unique; documents are summarised', () => {
    const a = extractFacts(bundle);
    const b = extractFacts(bundle);
    expect(a.facts.map((f) => f.id)).toEqual(b.facts.map((f) => f.id));
    expect(new Set(a.facts.map((f) => f.id)).size).toBe(a.facts.length);
    expect(a.documents.map((d) => d.name)).toHaveLength(5);
  });
  it('the five fixtures yield exactly 59 facts, no junk header-cell facts from a mirrored kv table', () => {
    const { facts } = extractFacts(bundle);
    // 59, not the pre-extractor-fix baseline of 61: fixing isLabelCell so a digit-bearing
    // material name (e.g. "Kathodenaktivmaterial NMC811") counts as a row label also suppresses
    // the spurious extra fact that row used to produce under its OWN "Material" column -- when
    // rowLabel was wrongly undefined, the BOM row's first cell wasn't skipped as the row label,
    // so it got its own standalone header-cell fact ({ label: 'Material', value:
    // 'Kathodenaktivmaterial NMC811' }), duplicating information already carried as the row's
    // label. With rowLabel correctly detected, that column-0 cell is now (correctly) skipped
    // per the `ci === 0 && rowLabel !== undefined` rule, for both affected BOM rows -- 2 fewer
    // facts (61 - 2 = 59), not a loss of real data.
    expect(facts).toHaveLength(59);
    // The declaration PDF's colon-terminated lines are column-aligned and get grouped into a
    // table by the layout pass; without the isTextHeaderRow colon guard, that mirrored table's
    // own first row would misclassify as a header describing the rows below it, and (once a
    // width-2 pair-like table was no longer unconditionally pair-like) generate junk header-cell
    // facts that never dedupe against the real kv-line facts. The PDF's only legitimate
    // header-cell facts are the six Post-/Pre-Consumer recycled-content rows.
    expect(
      facts.filter(
        (f) => f.shape === 'header-cell' && f.source.file === 'lieferantenerklaerung.pdf',
      ),
    ).toEqual(
      facts.filter(
        (f) =>
          f.shape === 'header-cell' &&
          f.source.file === 'lieferantenerklaerung.pdf' &&
          f.rowLabel !== undefined &&
          ['Kobalt', 'Lithium', 'Nickel'].includes(f.rowLabel),
      ),
    );
  });
});
