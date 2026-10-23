import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ModelVariant,
  MUSTERWERK,
  musterwerkContent,
  NOMINAL_VOLTAGE_V,
} from '../src/content.js';
import { FIXTURE_DIR } from '../src/generate.js';
import {
  generateSeries,
  listFiles,
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

  it('holds the single Musterwerk model and twelve models of five documents each', async () => {
    const want = await generateSeries();
    const folders = [...new Set([...want.keys()].map((k) => k.slice(0, k.lastIndexOf('/'))))];
    expect(folders).toEqual(['musterwerk', ...SERIES_MODELS.map((m) => `musterwerk-12/${m.id}`)]);
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

describe('the twelve models', () => {
  it('have distinct ids and serials in the Musterwerk pattern', () => {
    expect(new Set(SERIES_MODELS.map((m) => m.id)).size).toBe(12);
    expect(new Set(SERIES_MODELS.map((m) => m.serial)).size).toBe(12);
    for (const m of SERIES_MODELS) {
      expect(m.serial).toMatch(/^MW-EV-2026-\d{6}$/);
      expect(m.serial).not.toBe(MUSTERWERK.serial);
    }
  });

  it('stay within 10 % of the Musterwerk base on every varied value', () => {
    const within = (value: string | number, base: string | number, what: string) => {
      const ratio = Number(value) / Number(base);
      expect(ratio, what).toBeGreaterThanOrEqual(0.9);
      expect(ratio, what).toBeLessThanOrEqual(1.1);
    };
    for (const m of SERIES_MODELS) {
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
    (v) => {
      const c = musterwerkContent(v);
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
    },
  );
});
