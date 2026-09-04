import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type DocumentBundle, extractFacts, ingest } from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, 'fixtures', 'musterwerk');
const file = (name: string) => ({
  name,
  bytes: new Uint8Array(readFileSync(join(FIX, name))),
});
let bundle: DocumentBundle;
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
});

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
    expect(
      facts.find(
        (f) =>
          f.label === 'Kobalt rec. %' &&
          f.rowLabel === undefined &&
          f.source.cell === 'Stückliste!D2',
      ),
    ).toMatchObject({ value: '12.5', unit: '%' });
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
});
