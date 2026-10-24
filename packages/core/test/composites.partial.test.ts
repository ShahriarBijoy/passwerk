import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyMappings,
  buildEnvironment,
  COMPOSITE_SCHEMAS,
  emitAasJson,
  emitAasx,
  emitHtml,
  environmentToJsonable,
  extractFacts,
  gapReport,
  ingest,
  newDraft,
  type PassportDraft,
  suggestMappings,
  validate,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const META = {
  category: 'EV',
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://passport.musterwerk.example/battery/MW-EV-2026-000123',
} as const;

function draftWith(values: Record<string, unknown>): PassportDraft {
  const base = newDraft(META as never);
  const attributes: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(values)) {
    // recordedAt keeps PW-PLAUS-011 (dynamic values need a LastUpdate) out of the way.
    attributes[id] = { value, status: 'present', source: [], recordedAt: META.createdAt };
  }
  return { ...base, attributes } as PassportDraft;
}

/** Every path in a JSON-ish value whose value is `undefined` or not representable in JSON. */
function nonJsonPaths(value: unknown, path = '$'): string[] {
  if (value === undefined) return [path];
  if (typeof value === 'number' && !Number.isFinite(value)) return [path];
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return [path];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => nonJsonPaths(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => nonJsonPaths(v, `${path}.${k}`));
  }
  return [];
}

const emittedJson = (draft: PassportDraft) => environmentToJsonable(buildEnvironment(draft));
const rules = (draft: PassportDraft, attributeId?: string) =>
  validate(draft)
    .findings.filter((f) => attributeId === undefined || f.attributeId === attributeId)
    .map((f) => f.ruleId);

// Example A and B from the Claude Desktop report (draft drf_7d16371797a42251).
const A = { batteryChemistry: { shortName: 'NMC811' } };
const B = { manufacturerInformation: { name: { de: 'Musterwerk Batteriesysteme GmbH' } } };

describe('partial composites: emitters', () => {
  for (const [name, values] of [
    ['A (batteryChemistry.shortName only)', A],
    ['B (manufacturerInformation.name.de only)', B],
  ] as const) {
    it(`${name}: the AAS JSON holds no undefined and passes L2`, () => {
      const draft = draftWith(values);
      expect(nonJsonPaths(emittedJson(draft))).toEqual([]);
      const r = emitAasJson(draft);
      expect(r.findings.filter((f) => f.layer === 'L2')).toEqual([]);
      expect(r.verdict).toBe('invalid');
    });

    it(`${name}: the AASX passes L2`, async () => {
      const r = await emitAasx(draftWith(values));
      expect(r.findings.filter((f) => f.layer === 'L2')).toEqual([]);
    });

    it(`${name}: the HTML sheet is emitted with an honest verdict`, () => {
      const r = emitHtml(draftWith(values));
      expect(r.findings.filter((f) => f.layer === 'L2')).toEqual([]);
      expect(r.verdict).toBe('invalid');
    });
  }

  it('A: the HTML sheet lists the partial attribute as an open gap with its missing leaf', () => {
    const html = emitHtml(draftWith(A)).output;
    expect(html).toContain('these sub-fields are missing: clearName');
    expect(html).toContain('es fehlen diese Teilfelder: clearName');
  });

  it('A: the missing ClearName is an L3 missing-element finding', () => {
    const r = emitAasJson(draftWith(A));
    expect(
      r.findings.some(
        (f) => f.ruleId === 'PW-L3-MISSING' && f.templatePath === '6/BatteryChemistry/ClearName',
      ),
    ).toBe(true);
  });

  it('B: the missing ManufacturerIdentifier is left out and reported by L3, not written empty', () => {
    const r = emitAasJson(draftWith(B));
    expect(r.output).not.toContain('"ManufacturerIdentifier"');
    expect(
      r.findings.some(
        (f) => f.ruleId === 'PW-L3-MISSING' && f.templatePath === '1/ManufacturerIdentifier',
      ),
    ).toBe(true);
  });

  it('a manufacturer with an identifier but no name does not throw and passes L2', () => {
    const draft = draftWith({ manufacturerInformation: { identifier: 'DE-MW-0001' } });
    expect(nonJsonPaths(emittedJson(draft))).toEqual([]);
    const r = emitAasJson(draft);
    expect(r.findings.filter((f) => f.layer === 'L2')).toEqual([]);
    expect(
      r.findings.some(
        (f) => f.ruleId === 'PW-L3-MISSING' && f.templatePath === '1/ManufacturerName',
      ),
    ).toBe(true);
  });
});

describe('partial composites: L1', () => {
  it('A: clearName is reported missing, not as an invalid value', () => {
    const findings = validate(draftWith(A)).findings.filter(
      (f) => f.attributeId === 'batteryChemistry',
    );
    expect(findings.map((f) => f.ruleId)).toEqual(['PW-L1-COMPOSITE-INCOMPLETE']);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message.en).toContain('clearName');
    expect(findings[0]?.message.de).toContain('clearName');
  });

  it('B: identifier is reported missing; the optional address is not', () => {
    const findings = validate(draftWith(B)).findings.filter(
      (f) => f.attributeId === 'manufacturerInformation',
    );
    expect(findings.map((f) => f.ruleId)).toEqual(['PW-L1-COMPOSITE-INCOMPLETE']);
    expect(findings[0]?.message.en).toContain('identifier');
    expect(findings[0]?.message.en).not.toContain('address');
  });

  it('a partial passport is never valid', () => {
    expect(validate(draftWith(A)).verdict).toBe('invalid');
    expect(validate(draftWith(B)).verdict).toBe('invalid');
  });

  it('checks the leaves that are present as strictly as before', () => {
    const draft = draftWith({ initialInternalResistance: { cellOhm: '1,2' } });
    const findings = validate(draft).findings.filter(
      (f) => f.attributeId === 'initialInternalResistance',
    );
    const value = findings.find((f) => f.ruleId === 'PW-L1-VALUE');
    const incomplete = findings.find((f) => f.ruleId === 'PW-L1-COMPOSITE-INCOMPLETE');
    expect(value?.message.en).toContain('cellOhm');
    expect(value?.message.en).not.toContain('packOhm');
    expect(incomplete?.message.en).toContain('packOhm');
    expect(incomplete?.message.en).not.toContain('cellOhm');
  });

  it('an empty present leaf is still an invalid value, not a missing one', () => {
    const ids = rules(draftWith({ batteryChemistry: { shortName: '', clearName: 'x' } }));
    expect(ids).toContain('PW-L1-VALUE');
    expect(ids).not.toContain('PW-L1-COMPOSITE-INCOMPLETE');
  });

  it('missing leaves inside array rows carry the row index', () => {
    const draft = draftWith({ criticalRawMaterials: [{ name: 'Lithium' }] });
    const f = validate(draft).findings.find((x) => x.ruleId === 'PW-L1-COMPOSITE-INCOMPLETE');
    expect(f?.message.en).toContain('0.identifier');
    expect(rules(draft, 'criticalRawMaterials')).not.toContain('PW-L1-VALUE');
  });

  it('L4 still sees the present leaves of a partial composite', () => {
    // PW-PLAUS-014: an internal resistance above 10 ohms is almost certainly milliohms.
    const ids = rules(draftWith({ initialInternalResistance: { cellOhm: '15' } }));
    expect(ids).toContain('PW-PLAUS-014');
    expect(ids).toContain('PW-L1-COMPOSITE-INCOMPLETE');
  });
});

describe('partial composites: gap report', () => {
  const item = (draft: PassportDraft, id: string, withReport = true) =>
    gapReport(draft, withReport ? { report: validate(draft) } : {}).items.find(
      (i) => i.attributeId === id,
    );

  it('A: status partial with the missing leaf', () => {
    for (const withReport of [true, false]) {
      const i = item(draftWith(A), 'batteryChemistry', withReport);
      expect(i?.status).toBe('partial');
      expect(i?.missingLeaves).toEqual(['clearName']);
      expect(i?.suggestedAction.en).toContain('clearName');
      expect(i?.suggestedAction.de).toContain('clearName');
    }
  });

  it('B: status partial with the missing identifier', () => {
    const i = item(draftWith(B), 'manufacturerInformation');
    expect(i?.status).toBe('partial');
    expect(i?.missingLeaves).toEqual(['identifier']);
  });

  it('a partial value does not count toward completeness', () => {
    const partial = gapReport(draftWith(A), { report: validate(draftWith(A)) });
    const empty = gapReport(draftWith({}));
    expect(partial.completeness.mandatory.present).toBe(empty.completeness.mandatory.present);
    expect(partial.completeness.overall.present).toBe(empty.completeness.overall.present);
  });

  it('a wrong present leaf still makes the attribute invalid, with the missing leaves listed', () => {
    const draft = draftWith({ initialInternalResistance: { cellOhm: '1,2' } });
    const i = item(draft, 'initialInternalResistance');
    expect(i?.status).toBe('invalid');
    expect(i?.missingLeaves).toEqual(['packOhm']);
  });

  it('a full composite is present, counted, and carries no missingLeaves key', () => {
    const full = draftWith({
      batteryChemistry: { shortName: 'NMC', clearName: 'Lithium nickel manganese cobalt oxide' },
    });
    const i = item(full, 'batteryChemistry');
    expect(i?.status).toBe('present');
    expect(i && 'missingLeaves' in i).toBe(false);
    expect(rules(full, 'batteryChemistry')).toEqual([]);
  });
});

/** One complete value per composite; the sweep below removes one leaf at a time. */
const FULL: Record<string, unknown> = {
  manufacturerInformation: {
    name: { de: 'Musterwerk Batteriesysteme GmbH', en: 'Musterwerk Battery Systems GmbH' },
    identifier: 'DE-MW-0001',
    address: { street: 'Werkstrasse 1', zipCode: '28199', cityTown: 'Bremen', nationalCode: 'DE' },
  },
  batteryChemistry: { shortName: 'NMC', clearName: 'Lithium nickel manganese cobalt oxide' },
  criticalRawMaterials: [
    { name: 'Lithium', identifier: '7439-93-2', massKg: '6.40', location: { componentName: 'C' } },
  ],
  electrodeAndElectrolyteMaterials: [{ name: 'Copper', identifier: '7440-50-8' }],
  hazardousSubstances: [
    {
      name: 'Lithium hexafluorophosphate',
      identifier: '21324-40-3',
      class: 'AcuteToxicity',
      concentrationPercent: '1.2',
      impacts: ['H301 Toxic if swallowed'],
    },
  ],
  carbonFootprintGeneralInformation: {
    calculationMethods: ['ISO 14067:2018'],
    referenceImpactUnit: 'kWh',
    quantityOfMeasure: '1',
  },
  originalPowerCapability: [{ atSocPercent: '80', powerW: '250000' }],
  initialInternalResistance: { cellOhm: '0.0012', packOhm: '0.085', moduleOhm: '0.011' },
  remainingPowerCapability: { atSocPercent: '80', powerPercent: '95' },
  sparePartSources: [
    {
      name: { en: 'Nordsee Battery Service' },
      address: { nationalCode: 'DE', postalCode: '26382', street: 'Hafenstrasse 9' },
      email: 'service@nordsee-battery.example',
      website: 'https://service.nordsee-battery.example',
      components: [{ partName: 'Battery module', partNumber: 'MW-MOD-48-A' }],
    },
  ],
  componentPartNumbers: [{ partName: 'Battery management system', partNumber: 'MW-BMS-7' }],
};

/** Dotted paths of every scalar leaf (array indices included). */
function leafPaths(value: unknown, prefix: string[] = []): string[][] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leafPaths(v, [...prefix, String(i)]));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leafPaths(v, [...prefix, k]));
  }
  return [prefix];
}

function without(value: unknown, path: string[]): unknown {
  const copy = structuredClone(value) as Record<string, unknown>;
  let cursor: Record<string, unknown> = copy;
  for (const part of path.slice(0, -1)) cursor = cursor[part] as Record<string, unknown>;
  const last = path[path.length - 1] as string;
  if (Array.isArray(cursor)) cursor.splice(Number(last), 1);
  else delete cursor[last];
  return copy;
}

describe('partial composites: sweep over every composite leaf', () => {
  it('covers every modelled composite', () => {
    expect(Object.keys(FULL).sort()).toEqual(Object.keys(COMPOSITE_SCHEMAS).sort());
  });

  for (const [id, full] of Object.entries(FULL)) {
    it(`${id}: the full value passes L1`, () => {
      const l1 = validate(draftWith({ [id]: full })).findings.filter(
        (f) => f.layer === 'L1' && f.attributeId === id,
      );
      expect(l1).toEqual([]);
    });

    for (const path of leafPaths(full)) {
      it(`${id} without ${path.join('.')}: well-formed output, no value error for the gap`, () => {
        const draft = draftWith({ [id]: without(full, path) });
        expect(nonJsonPaths(emittedJson(draft))).toEqual([]);
        const report = validate(draft);
        expect(report.findings.filter((f) => f.ruleId === 'PW-L2-DESERIALIZE')).toEqual([]);
        expect(
          report.findings.filter((f) => f.attributeId === id && f.ruleId === 'PW-L1-VALUE'),
        ).toEqual([]);
        const removed = path.join('.');
        const incomplete = report.findings.find(
          (f) => f.attributeId === id && f.ruleId === 'PW-L1-COMPOSITE-INCOMPLETE',
        );
        const item = gapReport(draft, { report }).items.find((i) => i.attributeId === id);
        // A removed optional leaf leaves a complete value; a removed required one is partial.
        if (incomplete) {
          expect(report.verdict).toBe('invalid');
          expect(item?.status).toBe('partial');
          expect(item?.missingLeaves?.some((l) => removed.startsWith(l))).toBe(true);
        } else {
          expect(item?.status).not.toBe('partial');
          expect(item?.missingLeaves).toBeUndefined();
        }
      });
    }
  }
});

describe('partial composites: the real pipeline on the Musterwerk documents', () => {
  it('accepting only the leaves the documents hold yields partial, not invalid', async () => {
    const FIX = join(import.meta.dirname, 'fixtures', 'musterwerk');
    const files = (
      JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8')) as {
        files: Record<string, unknown>;
      }
    ).files;
    const bundle = await ingest(
      Object.keys(files).map((name) => ({
        name,
        bytes: new Uint8Array(readFileSync(join(FIX, name))),
      })),
    );
    const proposals = suggestMappings(extractFacts(bundle), { category: 'EV' });
    const pick = (attributeId: string, path: string) => {
      const p = proposals
        .filter((x) => x.attributeId === attributeId && x.path === path)
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (!p) throw new Error(`no proposal for ${attributeId}.${path}`);
      return { attributeId, path, value: p.value, source: p.source, confidence: p.confidence };
    };
    const { draft } = applyMappings(newDraft(META as never), [
      pick('batteryChemistry', 'shortName'),
      pick('manufacturerInformation', 'name.de'),
    ]);

    const json = emitAasJson(draft);
    expect(json.findings.filter((f) => f.layer === 'L2')).toEqual([]);
    expect(json.verdict).toBe('invalid');
    const gap = gapReport(draft, { report: json.report });
    const status = (id: string) => gap.items.find((i) => i.attributeId === id)?.status;
    expect(status('batteryChemistry')).toBe('partial');
    expect(status('manufacturerInformation')).toBe('partial');
  });
});
