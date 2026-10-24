import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ModelVariant,
  MUSTERWERK,
  MUSTERWERK_COMPLETE,
  type MusterwerkContent,
  musterwerkCompleteContent,
  musterwerkContent,
  NOMINAL_VOLTAGE_V,
  OMISSIONS,
  type Omission,
  supplierPackContent,
} from '../src/content.js';
import { FIXTURE_DIR } from '../src/generate.js';
import {
  generateSeries,
  listFiles,
  PACK_MODELS,
  SERIES_DIR,
  SERIES_MODELS,
  seriesDrift,
} from '../src/series.js';

const DOCUMENTS = [
  'datasheet-en.csv',
  'energierechnung.pdf',
  'handover-notes.docx',
  'lieferantenerklaerung.pdf',
  'stueckliste.xlsx',
];

describe('demo/series is exactly what the generator produces', () => {
  it('no committed file differs, is missing or is unexpected', async () => {
    const want = await generateSeries();
    expect(seriesDrift(want)).toEqual([]);
    expect(listFiles(SERIES_DIR).sort()).toEqual([...want.keys()].sort());
  });

  it('holds the single Musterwerk model, twelve models, the complete pack and sixty packs of five documents each', async () => {
    const want = await generateSeries();
    const folders = [...new Set([...want.keys()].map((k) => k.slice(0, k.lastIndexOf('/'))))];
    expect(folders).toEqual([
      'musterwerk',
      ...SERIES_MODELS.map((m) => `musterwerk-12/${m.id}`),
      'musterwerk-complete',
      ...PACK_MODELS.map((m) => `musterwerk-60/${m.id}`),
    ]);
    for (const folder of folders) {
      const names = [...want.keys()]
        .filter((k) => k.startsWith(`${folder}/`))
        .map((k) => k.slice(folder.length + 1))
        .sort();
      expect(names, folder).toEqual(DOCUMENTS);
    }
  });

  it('the single-model series is byte-identical to core’s Musterwerk fixtures', () => {
    for (const name of DOCUMENTS) {
      const fixture = readFileSync(join(FIXTURE_DIR, name));
      expect(readFileSync(join(SERIES_DIR, 'musterwerk', name)).equals(fixture), name).toBe(true);
    }
  });

  it('is deterministic across two runs', async () => {
    const a = await generateSeries();
    const b = await generateSeries();
    for (const [rel, bytes] of a) {
      expect(Buffer.from(bytes).equals(Buffer.from(b.get(rel) as Uint8Array)), rel).toBe(true);
    }
  });
});

const lookup = <T>(rows: [string, T][], label: string): T => {
  const row = rows.find(([k]) => k === label);
  if (!row) throw new Error(`no row ${label}`);
  return row[1];
};
const datasheet = (rows: string[][], label: string) =>
  lookup(
    rows.map((r) => [r[0] as string, r[1] as string]),
    label,
  );

describe('the complete pack', () => {
  it('is a distinct battery whose base lines and sheets stay those of its own Musterwerk content', () => {
    expect(MUSTERWERK_COMPLETE.serial).not.toBe(MUSTERWERK.serial);
    expect(SERIES_MODELS.map((m) => m.serial)).not.toContain(MUSTERWERK_COMPLETE.serial);
    const base = musterwerkContent(MUSTERWERK_COMPLETE);
    const complete = musterwerkCompleteContent(MUSTERWERK_COMPLETE);
    expect(complete.declarationLines.slice(0, base.declarationLines.length)).toEqual(
      base.declarationLines,
    );
    expect(complete.datasheetRows.slice(0, base.datasheetRows.length)).toEqual(base.datasheetRows);
    expect(complete.bomRows.slice(1)).toEqual(base.bomRows.slice(1));
    expect({
      ...complete,
      declarationLines: base.declarationLines,
      datasheetRows: base.datasheetRows,
      bomRows: base.bomRows,
      leistungRows: base.leistungRows,
      moreSheets: base.moreSheets,
      handoverTable: base.handoverTable,
    }).toEqual(base);
  });

  it('states each label once per document', () => {
    const complete = musterwerkCompleteContent(MUSTERWERK_COMPLETE);
    for (const labels of [
      complete.declarationLines.map(([k]) => k),
      complete.leistungRows.map((r) => r[0]),
    ]) {
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe('the twelve models', () => {
  it('have distinct ids and serials in the Musterwerk pattern', () => {
    expect(new Set(SERIES_MODELS.map((m) => m.id)).size).toBe(12);
    expect(new Set(SERIES_MODELS.map((m) => m.serial)).size).toBe(12);
    for (const m of SERIES_MODELS) {
      expect(m.serial).toMatch(/^MW-EV-2026-\d{6}$/);
      expect(m.serial).not.toBe(MUSTERWERK.serial);
    }
  });

  it('stay within 10 % of the Musterwerk base on every varied value, as do the sixty', () => {
    const within = (value: string | number, base: string | number, what: string) => {
      const ratio = Number(value) / Number(base);
      expect(ratio, what).toBeGreaterThanOrEqual(0.9);
      expect(ratio, what).toBeLessThanOrEqual(1.1);
    };
    for (const m of [...SERIES_MODELS, ...PACK_MODELS]) {
      within(m.ratedCapacityAh, MUSTERWERK.ratedCapacityAh, `${m.id} capacity`);
      within(m.massKg, MUSTERWERK.massKg, `${m.id} mass`);
      within(m.cycleLife, MUSTERWERK.cycleLife, `${m.id} cycle life`);
      for (const material of ['cobalt', 'lithium', 'nickel'] as const) {
        for (const kind of ['post', 'pre'] as const) {
          within(
            m.recycled[material][kind],
            MUSTERWERK.recycled[material][kind],
            `${m.id} ${material} ${kind}`,
          );
        }
      }
    }
  });

  it.each([MUSTERWERK, ...SERIES_MODELS] as ModelVariant[])(
    '$serial states each shared value the same way in every document',
    (v) => expectConsistent(v, musterwerkContent(v)),
  );
});

function expectConsistent(v: ModelVariant, c: MusterwerkContent) {
  const de = (s: string) => s.replace('.', ',');

  expect(c.declarationTitle).toContain(v.serial);
  expect(lookup(c.declarationLines, 'Batteriekennung:')).toBe(v.serial);
  expect(lookup(c.stammdaten, 'Seriennummer')).toBe(v.serial);
  expect(lookup(c.stammdaten, 'Batteriepass-ID')).toBe(
    `https://passport.musterwerk.example/battery/${v.serial}`,
  );
  expect(c.handoverParagraphs[0]).toContain(v.serial);

  expect(lookup(c.declarationLines, 'Nennkapazität:')).toBe(`${de(v.ratedCapacityAh)} Ah`);
  expect(datasheet(c.datasheetRows, 'Rated capacity')).toBe(v.ratedCapacityAh);

  expect(lookup(c.declarationLines, 'Batteriemasse:')).toBe(`${de(v.massKg)} kg`);
  expect(lookup(c.stammdaten, 'Batteriemasse [kg]')).toBe(Number(v.massKg));
  expect(datasheet(c.datasheetRows, 'Battery mass')).toBe(v.massKg);

  expect(lookup(c.declarationLines, 'Zyklenlebensdauer:')).toBe(`${v.cycleLife} Zyklen`);
  expect(datasheet(c.datasheetRows, 'Cycle life')).toBe(String(v.cycleLife));

  expect(lookup(c.declarationLines, 'Nennspannung:')).toBe(`${de(NOMINAL_VOLTAGE_V)} V`);
  expect(datasheet(c.datasheetRows, 'Nominal voltage')).toBe(NOMINAL_VOLTAGE_V);

  const kwh = lookup(c.stammdaten, 'Nennenergie [kWh]') as number;
  expect(datasheet(c.datasheetRows, 'Rated energy')).toBe(String(Math.round(kwh * 1000)));
  const product = (Number(v.ratedCapacityAh) * Number(NOMINAL_VOLTAGE_V)) / 1000;
  expect(Math.abs(kwh - product)).toBeLessThanOrEqual(0.05);

  const cobalt = c.declarationTableRows.find((r) => r[0] === 'Kobalt');
  expect(cobalt).toEqual([
    'Kobalt',
    `${de(v.recycled.cobalt.post)} %`,
    `${de(v.recycled.cobalt.pre)} %`,
  ]);
  expect(c.bomRows[0]?.[3]).toBe(Number(v.recycled.cobalt.post));

  const chemistry = lookup(c.declarationLines, 'Zellchemie:');
  expect(String(c.bomRows[0]?.[0])).toContain(chemistry);
}

/** Whether a pack still holds each kind of paperwork, read independently of OMISSIONS. */
const HOLDS: Record<Omission, (c: MusterwerkContent) => boolean> = {
  'bms-readout': (c) => c.moreSheets.some((s) => s.name === 'BMS-Auslesung'),
  'manufacturer-address': (c) => c.declarationLines.some(([k]) => k === 'Anschrift:'),
  'end-user-documents': (c) =>
    ['EOL-PREVENTION-MW-EV-2026', 'EOL-SEPARATE-MW-EV-2026', 'EOL-COLLECTION-MW-EV-2026'].every(
      (id) => c.handoverTable.some((r) => r[0] === id),
    ),
  'material-declaration': (c) => c.moreSheets.some((s) => s.name === 'Materialdeklaration'),
  'spare-part-sheets': (c) =>
    c.moreSheets.some((s) => s.name === 'Ersatzteile') &&
    c.moreSheets.some((s) => s.name === 'Bezugsquellen'),
};
const KINDS = Object.keys(OMISSIONS) as Omission[];

describe('the sixty supplier packs', () => {
  it('have distinct ids model-01 to model-60', () => {
    expect(PACK_MODELS.map((m) => m.id)).toEqual(
      Array.from({ length: 60 }, (_, i) => `model-${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('use serials in the Musterwerk pattern that no other demo series uses', () => {
    const serials = [MUSTERWERK, MUSTERWERK_COMPLETE, ...SERIES_MODELS, ...PACK_MODELS].map(
      (m) => m.serial,
    );
    expect(new Set(serials).size).toBe(serials.length);
    for (const m of PACK_MODELS) expect(m.serial).toMatch(/^MW-EV-2026-\d{6}$/);
  });

  it('are complete except every fifth, which lacks one or two kinds of paperwork', () => {
    const incomplete = PACK_MODELS.filter((m) => m.missing.length > 0).map((m) => m.id);
    expect(incomplete).toEqual(PACK_MODELS.filter((_, i) => (i + 1) % 5 === 0).map((m) => m.id));
    expect(incomplete).toHaveLength(12);
    const used = new Set(PACK_MODELS.flatMap((m) => [...m.missing]));
    expect([...used].sort()).toEqual([...KINDS].sort());
  });

  it.each(PACK_MODELS)('$id lacks exactly the paperwork its row names', (m) => {
    const c = supplierPackContent(m, m.missing);
    expect(KINDS.filter((kind) => !HOLDS[kind](c)).sort()).toEqual([...m.missing].sort());
    if (m.missing.length === 0) expect(c).toEqual(musterwerkCompleteContent(m));
  });

  it.each(PACK_MODELS)('$id states each shared value the same way in every document', (m) =>
    expectConsistent(m, supplierPackContent(m, m.missing)),
  );
});
