/**
 * Structural validation of the authored attribute knowledge base (kb/attributes/*.json).
 * Semantics are reviewed by humans; this suite makes sure every cross-reference resolves.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import ec from '../kb/ec-datapoints.json' with { type: 'json' };
import longlistJson from '../kb/generated/din-longlist.json' with { type: 'json' };
import catalogueJson from '../kb/generated/template-catalogue.json' with { type: 'json' };
import type { TemplateCatalogue } from '../scripts/lib/catalogue.ts';
import type { Longlist } from '../scripts/lib/longlist.ts';

const catalogue = catalogueJson as unknown as TemplateCatalogue;
const longlist = longlistJson as unknown as Longlist;

const CATEGORIES = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'] as const;
const VALUE_KINDS = [
  'identifier',
  'text',
  'multilingualText',
  'decimal',
  'integer',
  'percentage',
  'date',
  'dateTime',
  'boolean',
  'enum',
  'document',
  'uri',
  'graphic',
  'composite',
];
const UNITS = [
  'kg',
  'g',
  'Ah',
  'kWh',
  'Wh',
  'V',
  'W',
  'W/Wh',
  '%',
  '%/month',
  'Ohm',
  'degC',
  'min',
  'cycles',
  'years',
  'months',
  'kgCO2e/kWh',
  'tCO2e',
  'C',
];
const STATUSES = ['mandatory', 'optional', 'conditional', 'not_yet_applicable', 'not_displayed'];
/**
 * Commission data points that need no attribute of their own: 16 and 25 are repetitions of other
 * data points; 44 (instructions for use, deferred pending the Omnibus) has no DIN DKE SPEC 99100
 * attribute and is a document carried in Part 2 Handover Documentation.
 */
const EC_WITHOUT_ATTRIBUTE = new Set([16, 25, 44]);

interface LangText {
  en: string;
  de: string;
}
interface Attribute {
  id: string;
  din: { no: number; chapter: string };
  ecDataPoints: number[];
  part: number | null;
  templatePaths: string[];
  name: LangText;
  synonyms: { en: string[]; de: string[] };
  valueKind: string;
  unit: string | null;
  range: { min: number | null; max: number | null } | null;
  whoTypicallyHasIt: LangText;
  explanation: LangText;
  applicabilityOverride: Record<string, { status: string; text: string } | string> | null;
  verify: boolean;
  lastVerified: string;
}
interface AttributeFile {
  category: string;
  attributes: Attribute[];
}

const dir = resolve(import.meta.dirname, '../kb/attributes');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const loaded = files.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as AttributeFile,
}));
const all = loaded.flatMap((x) => x.data.attributes.map((a) => ({ ...a, file: x.file })));

const catalogueByPath = new Map(
  catalogue.templates.flatMap((t) => t.elements.map((e) => [e.path, e] as const)),
);
const longlistByNo = new Map(longlist.rows.map((r) => [r.no, r] as const));
const ecByNumber = new Map(ec.dataPoints.map((d) => [d.number, d] as const));

describe('kb/attributes/*.json', () => {
  it('has at least one attribute file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('ids are unique and camelCase', () => {
    const ids = all.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][A-Za-z0-9]*$/);
  });

  it('every attribute resolves to exactly one longlist row (no + chapter agree)', () => {
    for (const a of all) {
      const row = longlistByNo.get(a.din.no);
      expect(row, `${a.id}: longlist row ${a.din.no}`).toBeDefined();
      expect(row?.dinChapter, `${a.id}: DIN chapter`).toBe(a.din.chapter);
    }
    const nos = all.map((a) => a.din.no);
    expect(new Set(nos).size, 'each longlist row is claimed by at most one attribute').toBe(
      nos.length,
    );
  });

  it('every attribute has German and English text everywhere', () => {
    for (const a of all) {
      for (const field of ['name', 'whoTypicallyHasIt', 'explanation'] as const) {
        expect(a[field].en?.trim().length, `${a.id}.${field}.en`).toBeGreaterThan(2);
        expect(a[field].de?.trim().length, `${a.id}.${field}.de`).toBeGreaterThan(2);
      }
      expect(a.synonyms.en.length, `${a.id}.synonyms.en`).toBeGreaterThanOrEqual(2);
      expect(a.synonyms.de.length, `${a.id}.synonyms.de`).toBeGreaterThanOrEqual(2);
      for (const s of [...a.synonyms.en, ...a.synonyms.de]) {
        expect(s, `${a.id} synonym "${s}" must be lower-case`).toBe(s.toLowerCase());
      }
    }
  });

  it('every EC data point reference exists, and the primary one is first', () => {
    for (const a of all) {
      for (const n of a.ecDataPoints) {
        expect(ecByNumber.has(n), `${a.id}: EC data point ${n}`).toBe(true);
      }
      expect(new Set(a.ecDataPoints).size).toBe(a.ecDataPoints.length);
    }
  });

  it('applicability resolves for all three categories, either via the primary EC data point or an explicit override', () => {
    for (const a of all) {
      if (a.ecDataPoints.length > 0) {
        expect(
          a.applicabilityOverride,
          `${a.id}: override not allowed when EC data points exist`,
        ).toBeNull();
        const primary = ecByNumber.get(a.ecDataPoints[0] as number);
        for (const cat of CATEGORIES) expect(primary?.applicability[cat].status).toBeDefined();
      } else {
        const o = a.applicabilityOverride;
        expect(o, `${a.id}: needs applicabilityOverride`).not.toBeNull();
        expect(typeof o?.['source'], `${a.id}: override.source`).toBe('string');
        for (const cat of CATEGORIES) {
          const cell = o?.[cat] as { status: string; text: string } | undefined;
          expect(STATUSES, `${a.id}: override.${cat}.status`).toContain(cell?.status);
          expect(cell?.text?.length, `${a.id}: override.${cat}.text`).toBeGreaterThan(5);
        }
        expect(a.verify, `${a.id}: DIN-only attributes must carry verify: true`).toBe(true);
      }
    }
  });

  it('every template path exists in the catalogue and belongs to the declared part', () => {
    for (const a of all) {
      if (a.part === null) {
        expect(a.templatePaths, `${a.id}: no part, no paths`).toEqual([]);
        expect(a.verify, `${a.id}: unmapped attributes must carry verify: true`).toBe(true);
        continue;
      }
      expect(
        a.templatePaths.length,
        `${a.id}: part ${a.part} but no template paths`,
      ).toBeGreaterThan(0);
      for (const p of a.templatePaths) {
        const el = catalogueByPath.get(p);
        expect(el, `${a.id}: template path ${p}`).toBeDefined();
        expect(el?.part, `${a.id}: ${p} is in part ${el?.part}, attribute says ${a.part}`).toBe(
          a.part,
        );
      }
    }
  });

  it('uses only the documented value kinds, units and date format', () => {
    for (const a of all) {
      expect(VALUE_KINDS, `${a.id}.valueKind`).toContain(a.valueKind);
      if (a.unit !== null) expect(UNITS, `${a.id}.unit`).toContain(a.unit);
      expect(a.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof a.verify).toBe('boolean');
      if (a.range) {
        if (a.range.min !== null && a.range.max !== null)
          expect(a.range.min).toBeLessThanOrEqual(a.range.max);
      }
    }
  });

  it('covers all 93 longlist rows', () => {
    const covered = new Set(all.map((a) => a.din.no));
    const missing = longlist.rows.map((r) => r.no).filter((n) => !covered.has(n));
    expect(missing, `longlist rows without an attribute: ${missing.join(', ')}`).toEqual([]);
  });

  it('covers all 71 EC data points except 16, 25 (repetitions) and 44 (document)', () => {
    const covered = new Set(all.flatMap((a) => a.ecDataPoints));
    const missing = ec.dataPoints
      .map((d) => d.number)
      .filter((n) => !EC_WITHOUT_ATTRIBUTE.has(n) && !covered.has(n));
    expect(missing, `EC data points without an attribute: ${missing.join(', ')}`).toEqual([]);
  });
});
