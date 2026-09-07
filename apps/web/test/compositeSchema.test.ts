import { describe, expect, it } from 'vitest';
import {
  arrayElementLeaves,
  compositeSchemaOf,
  isArrayComposite,
} from '@/workflow/compositeSchema.ts';

describe('arrayElementLeaves', () => {
  it('lists the scalar leaves of a material row with required flags', () => {
    expect(arrayElementLeaves('criticalRawMaterials')).toEqual([
      { path: 'name', kind: 'scalar', required: true },
      { path: 'identifier', kind: 'scalar', required: true },
      { path: 'massKg', kind: 'scalar', required: false },
      { path: 'location.componentName', kind: 'scalar', required: false },
      { path: 'location.componentId', kind: 'scalar', required: false },
    ]);
  });
  it('reports a nested string array as a list leaf', () => {
    const leaves = arrayElementLeaves('hazardousSubstances');
    expect(leaves.find((l) => l.path === 'impacts')).toEqual({
      path: 'impacts',
      kind: 'list',
      required: false,
    });
  });
  it('reports a nested object array as rows with its own leaves, and a record as language leaves', () => {
    const leaves = arrayElementLeaves('sparePartSources');
    expect(leaves.map((l) => l.path)).toEqual([
      'name.de',
      'name.en',
      'address.nationalCode',
      'address.postalCode',
      'address.street',
      'email',
      'website',
      'components',
    ]);
    const components = leaves.find((l) => l.path === 'components');
    expect(components?.kind).toBe('rows');
    expect(components?.rows).toEqual([
      { path: 'partName', kind: 'scalar', required: true },
      { path: 'partNumber', kind: 'scalar', required: true },
    ]);
    expect(leaves.find((l) => l.path === 'address.street')?.required).toBe(false);
  });
  it('is empty for an object composite and for an unknown id', () => {
    expect(arrayElementLeaves('manufacturerInformation')).toEqual([]);
    expect(arrayElementLeaves('nope')).toEqual([]);
    expect(isArrayComposite('originalPowerCapability')).toBe(true);
  });
  it('compositeSchemaOf parses a whole value', () => {
    const schema = compositeSchemaOf('componentPartNumbers');
    expect(schema?.safeParse([{ partName: 'a', partNumber: 'b' }]).success).toBe(true);
    const bad = schema?.safeParse([{ partName: '' }]);
    expect(bad?.success).toBe(false);
    if (bad && !bad.success) expect(bad.error.issues[0]?.path).toEqual([0, 'partName']);
  });
});
