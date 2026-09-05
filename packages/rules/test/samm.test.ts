/**
 * scripts/lib/samm.ts reads the Battery Pass SAMM aspect models (Turtle) and produces a flat,
 * deterministic property index. Every value must be copied from the Turtle; the only derived
 * fields are `paths`, `dinChapters` (parsed from the description) and the resolved
 * characteristic (units, data types, enumeration values, range constraints).
 */
import { describe, expect, it } from 'vitest';
import { extractSammModel, parseDinChapters } from '../scripts/lib/samm.ts';

const TTL = `
@prefix samm: <urn:samm:org.eclipse.esmf.samm:meta-model:2.1.0#> .
@prefix samm-c: <urn:samm:org.eclipse.esmf.samm:characteristic:2.1.0#> .
@prefix unit: <urn:samm:org.eclipse.esmf.samm:unit:2.1.0#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix : <urn:samm:io.BatteryPass.Demo:1.2.0#> .

:Demo a samm:Aspect ;
   samm:properties ( :mass :status [ samm:property :cRate; samm:optional true ] :parts ) ;
   samm:operations ( ) .

:mass a samm:Property ;
   samm:preferredName "battery mass"@en ;
   samm:description "Mass of the battery. BR Annex XIII (1e)\\n\\nDIN DKE Spec 99100 chapter reference: 6.1.3.6"@en ;
   samm:characteristic :MassTrait .

:MassTrait a samm-c:Trait ;
   samm-c:baseCharacteristic :Mass ;
   samm-c:constraint :MassRange .

:Mass a samm-c:Measurement ;
   samm:dataType xsd:float ;
   samm-c:unit unit:kilogram .

:MassRange a samm-c:RangeConstraint ;
   samm-c:minValue "0"^^xsd:float ;
   samm-c:maxValue "10000"^^xsd:float .

:status a samm:Property ;
   samm:preferredName "status"@en ;
   samm:description "Status of the battery"@en ;
   samm:characteristic :Status .

:Status a samm-c:Enumeration ;
   samm:dataType xsd:string ;
   samm-c:values ( "original" "repurposed" "original" ) .

:cRate a samm:Property ;
   samm:characteristic :CRate .

:CRate a samm-c:Quantifiable ;
   samm:dataType xsd:float ;
   samm-c:unit :C .

:C a samm:Unit ;
   samm:symbol "C" .

:parts a samm:Property ;
   samm:description "Parts list. DIN DKE Spec 99100 chapter reference: 6.6.2.3 - 6.6.2.5"@en ;
   samm:characteristic :PartList .

:PartList a samm-c:List ;
   samm:dataType :PartEntity .

:PartEntity a samm:Entity ;
   samm:properties ( :partName :mass ) .

:partName a samm:Property ;
   samm:characteristic samm-c:Text .
`;

describe('parseDinChapters', () => {
  it('reads single chapters, ranges with a full or a short end, and lists', () => {
    expect(parseDinChapters('x\n\nDIN DKE Spec 99100 chapter reference: 6.6.1.2')).toEqual([
      '6.6.1.2',
    ]);
    expect(parseDinChapters('DIN DKE Spec 99100 chapter reference: 6.7.7.5 - 8')).toEqual([
      '6.7.7.5',
      '6.7.7.6',
      '6.7.7.7',
      '6.7.7.8',
    ]);
    expect(parseDinChapters('DIN DKE Spec 99100 chapter reference: 6.7.6.3-4')).toEqual([
      '6.7.6.3',
      '6.7.6.4',
    ]);
    expect(parseDinChapters('DIN DKE Spec 99100 chapter reference:  6.5.3-6.5.4')).toEqual([
      '6.5.3',
      '6.5.4',
    ]);
    expect(
      parseDinChapters(
        'DIN DKE Spec 99100 chapter reference: \n6.3.3: Raw material extraction\n6.3.4: Main production',
      ),
    ).toEqual(['6.3.3', '6.3.4']);
    expect(parseDinChapters('no reference here')).toEqual([]);
  });
});

describe('extractSammModel', () => {
  const model = extractSammModel([
    { key: 'Demo', version: '1.2.0', file: 'demo.ttl', turtle: TTL },
  ]);
  const section = model.sections[0]!;
  const byName = new Map(section.properties.map((p) => [p.name, p]));

  it('records the aspect, namespace and every samm:Property once', () => {
    expect(section.aspect).toBe('Demo');
    expect(section.namespace).toBe('urn:samm:io.BatteryPass.Demo:1.2.0#');
    expect(section.properties.map((p) => p.name)).toEqual([
      'cRate',
      'mass',
      'partName',
      'parts',
      'status',
    ]);
  });

  it('resolves a Trait to its base characteristic, unit and range constraint', () => {
    const mass = byName.get('mass')!;
    expect(mass.urn).toBe('urn:samm:io.BatteryPass.Demo:1.2.0#mass');
    expect(mass.preferredName).toBe('battery mass');
    expect(mass.dinChapters).toEqual(['6.1.3.6']);
    expect(mass.characteristic).toEqual({
      name: 'MassTrait',
      kind: 'Measurement',
      dataType: 'xsd:float',
      unit: 'kilogram',
      unitSymbol: null,
      values: null,
      entity: null,
      range: { min: '0', max: '10000' },
    });
  });

  it('keeps enumeration values in order and without duplicates', () => {
    expect(byName.get('status')!.characteristic.values).toEqual(['original', 'repurposed']);
    expect(byName.get('status')!.characteristic.kind).toBe('Enumeration');
  });

  it('reads a model-local samm:Unit by its symbol and marks optional properties', () => {
    const cRate = byName.get('cRate')!;
    expect(cRate.characteristic.unit).toBe('C');
    expect(cRate.characteristic.unitSymbol).toBe('C');
    expect(cRate.optional).toBe(true);
    expect(byName.get('mass')!.optional).toBe(false);
  });

  it('walks entities to build paths and expands chapter ranges', () => {
    expect(byName.get('parts')!.characteristic).toMatchObject({
      kind: 'List',
      entity: 'PartEntity',
      dataType: null,
    });
    expect(byName.get('parts')!.dinChapters).toEqual(['6.6.2.3', '6.6.2.4', '6.6.2.5']);
    expect(byName.get('partName')!.paths).toEqual(['Demo/parts/partName']);
    expect(byName.get('mass')!.paths).toEqual(['Demo/mass', 'Demo/parts/mass']);
    expect(byName.get('partName')!.characteristic.kind).toBe('Text');
  });

  it('is deterministic: JSON output is byte-identical across runs', () => {
    const again = extractSammModel([
      { key: 'Demo', version: '1.2.0', file: 'demo.ttl', turtle: TTL },
    ]);
    expect(JSON.stringify(again)).toBe(JSON.stringify(model));
  });
});
