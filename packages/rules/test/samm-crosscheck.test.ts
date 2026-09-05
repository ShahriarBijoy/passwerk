/**
 * The Battery Pass SAMM cross-check joins knowledge-base attributes to SAMM properties by DIN
 * chapter and by IDTA semanticId local name, and reports unit, type, enum and range
 * disagreements. It never changes the knowledge base.
 */
import { attributes } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';
import committedSammJson from '../kb/generated/batterypass-samm.json' with { type: 'json' };
import type { SammCharacteristic, SammModel, SammProperty } from '../scripts/lib/samm.ts';
import { crossCheck } from '../scripts/lib/samm-crosscheck.ts';

const committedSamm = committedSammJson as unknown as SammModel;

const leaf = (over: Partial<SammCharacteristic>): SammCharacteristic => ({
  name: 'X',
  kind: 'Measurement',
  dataType: 'xsd:float',
  unit: null,
  unitSymbol: null,
  values: null,
  entity: null,
  range: null,
  ...over,
});

const property = (name: string, over: Partial<SammProperty>): SammProperty => ({
  name,
  urn: `urn:samm:io.BatteryPass.Test:1.2.0#${name}`,
  preferredName: null,
  description: null,
  dinChapters: [],
  paths: [`Test/${name}`],
  optional: false,
  characteristic: leaf({}),
  ...over,
});

const model = (properties: SammProperty[]): SammModel => ({
  $comment: 'test',
  sections: [
    {
      key: 'Test',
      version: '1.2.0',
      file: 'test.ttl',
      aspect: 'Test',
      namespace: 'urn:samm:io.BatteryPass.Test:1.2.0#',
      description: null,
      propertyCount: properties.length,
      properties,
    },
  ],
});

const batteryMass = attributes.find((a) => a.id === 'batteryMass')!;
const only = (id: string) => attributes.filter((a) => a.id === id);

describe('crossCheck joins', () => {
  it('joins by DIN chapter and reports ok when unit and type agree', () => {
    const result = crossCheck(
      only('batteryMass'),
      model([
        property('mass', {
          dinChapters: [batteryMass.din.chapter],
          characteristic: leaf({ unit: 'kilogram' }),
        }),
      ]),
    );
    expect(result.attributes).toEqual([
      expect.objectContaining({ id: 'batteryMass', status: 'ok' }),
    ]);
    expect(result.attributes[0]!.matches[0]).toMatchObject({
      joins: ['din'],
      unitMapped: 'kg',
      findings: [],
    });
    expect(result.summary).toEqual({ ok: 1, note: 0, mismatch: 0, unmatched: 0, unclaimed: 0 });
  });

  it('downgrades findings to notes when a name join hits one of several template elements', () => {
    // currentSelfDischargeRate maps to a value element and its lastUpdate timestamp.
    const attribute = attributes.find((a) => a.id === 'currentSelfDischargeRate')!;
    expect(attribute.templateElements.length).toBeGreaterThan(1);
    const valueName = attribute.templateElements[0]!.semanticId!.split('#')[1]!;
    const result = crossCheck(
      [attribute],
      model([property(valueName, { characteristic: leaf({ unit: 'percent' }) })]),
    );
    expect(result.attributes[0]!.status).toBe('note');
    expect(result.attributes[0]!.matches[0]!.findings).toEqual([
      expect.objectContaining({ code: 'unit', severity: 'note' }),
    ]);
  });

  it('never compares a composite attribute by data type, and notes its unit only', () => {
    const composite = attributes.find((a) => a.id === 'criticalRawMaterials')!;
    expect(composite.valueKind).toBe('composite');
    const result = crossCheck(
      [composite],
      model([
        property('mass', {
          dinChapters: [composite.din.chapter],
          characteristic: leaf({ unit: 'gram', dataType: 'xsd:float' }),
        }),
      ]),
    );
    expect(result.attributes[0]!.matches[0]!.findings).toEqual([
      expect.objectContaining({ code: 'unit', severity: 'note' }),
    ]);
  });

  it('joins by the IDTA semanticId local name and flags a chapter disagreement', () => {
    const idtaName = batteryMass.templateElements[0]!.semanticId!.split('#')[1]!;
    const result = crossCheck(
      only('batteryMass'),
      model([
        property(idtaName, {
          dinChapters: ['9.9.9'],
          characteristic: leaf({ unit: 'kilogram' }),
        }),
      ]),
    );
    const match = result.attributes[0]!.matches[0]!;
    expect(match.joins).toEqual(['name']);
    expect(match.findings).toEqual([
      expect.objectContaining({ code: 'chapter', severity: 'mismatch' }),
    ]);
    expect(result.attributes[0]!.status).toBe('mismatch');
  });

  it('reports unmatched attributes and unclaimed SAMM properties', () => {
    const result = crossCheck(
      only('batteryMass'),
      model([property('orphan', { dinChapters: ['9.9.9'] })]),
    );
    expect(result.attributes[0]!.status).toBe('unmatched');
    expect(result.unclaimed).toEqual([{ section: 'Test', name: 'orphan', dinChapters: ['9.9.9'] }]);
  });
});

describe('crossCheck findings', () => {
  const withMass = (characteristic: SammCharacteristic) =>
    crossCheck(
      only('batteryMass'),
      model([property('mass', { dinChapters: [batteryMass.din.chapter], characteristic })]),
    ).attributes[0]!.matches[0]!.findings;

  it('flags a unit disagreement and an unmapped unit', () => {
    expect(withMass(leaf({ unit: 'gram' }))).toEqual([
      expect.objectContaining({ code: 'unit', severity: 'mismatch' }),
    ]);
    expect(withMass(leaf({ unit: 'furlong' }))).toEqual([
      expect.objectContaining({ code: 'unit', severity: 'note' }),
    ]);
  });

  it('flags a data type that cannot carry the valueKind', () => {
    expect(withMass(leaf({ unit: 'kilogram', dataType: 'xsd:boolean' }))).toEqual([
      expect.objectContaining({ code: 'valueKind', severity: 'mismatch' }),
    ]);
    expect(withMass(leaf({ unit: 'kilogram', dataType: 'xsd:integer' }))).toEqual([]);
  });

  it('accepts an integer attribute for a float SAMM property, and not the other way round', () => {
    const integerAttribute = attributes.find((a) => a.valueKind === 'integer')!;
    const asFloat = crossCheck(
      [integerAttribute],
      model([
        property('n', {
          dinChapters: [integerAttribute.din.chapter],
          characteristic: leaf({ unit: null, dataType: 'xsd:double' }),
        }),
      ]),
    ).attributes[0]!.matches[0]!.findings;
    expect(asFloat.filter((f) => f.code === 'valueKind')).toEqual([]);
    expect(withMass(leaf({ unit: 'kilogram', dataType: 'xsd:boolean' }))).toHaveLength(1);
  });

  it('notes an enumeration the attribute does not model as enum', () => {
    expect(
      withMass(
        leaf({
          unit: 'kilogram',
          kind: 'Enumeration',
          dataType: 'xsd:string',
          values: ['a', 'b'],
        }),
      ),
    ).toEqual([
      expect.objectContaining({ code: 'valueKind', severity: 'mismatch' }),
      expect.objectContaining({
        code: 'enum',
        severity: 'note',
        text: expect.stringContaining('a | b'),
      }),
    ]);
  });

  it('compares range constraints against the plausibility band', () => {
    // batteryMass has range 0..10000 in the knowledge base.
    expect(withMass(leaf({ unit: 'kilogram', range: { min: '0', max: '10000' } }))).toEqual([]);
    expect(withMass(leaf({ unit: 'kilogram', range: { min: '0', max: '5000' } }))).toEqual([
      expect.objectContaining({ code: 'range', severity: 'mismatch' }),
    ]);
    expect(withMass(leaf({ unit: 'kilogram', range: { min: '0', max: '20000' } }))).toEqual([
      expect.objectContaining({ code: 'range', severity: 'note' }),
    ]);
  });

  it('does not check units or types on entity-valued properties', () => {
    expect(withMass(leaf({ kind: 'SingleEntity', dataType: null, entity: 'MassEntity' }))).toEqual(
      [],
    );
  });
});

describe('crossCheck over the bundled Battery Pass model', () => {
  const result = crossCheck(attributes, committedSamm);

  it('is deterministic and covers every attribute once', () => {
    expect(result.attributes.map((a) => a.id)).toEqual([...attributes.map((a) => a.id)].sort());
    expect(JSON.stringify(crossCheck(attributes, committedSamm))).toBe(JSON.stringify(result));
  });

  it('joins most attributes to at least one SAMM property', () => {
    // Regression guard: the join keys must keep working when either side is re-pinned.
    expect(
      result.summary.ok + result.summary.note + result.summary.mismatch,
    ).toBeGreaterThanOrEqual(70);
  });

  it('every match carries the join kind that produced it', () => {
    for (const a of result.attributes) {
      for (const m of a.matches) {
        expect(m.joins.length, `${a.id} ${m.name}`).toBeGreaterThan(0);
        if (m.joins.includes('din')) {
          const attribute = attributes.find((x) => x.id === a.id)!;
          expect(m.dinChapters).toContain(attribute.din.chapter);
        }
      }
    }
  });
});
