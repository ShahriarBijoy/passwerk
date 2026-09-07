import { describe, expect, it } from 'vitest';
import { arrayElementLeaves } from '@/workflow/compositeSchema.ts';
import { buildRows, checkRows, emptyRow, rowsFromValue } from '@/workflow/rows.ts';

const material = arrayElementLeaves('criticalRawMaterials');
const supplier = arrayElementLeaves('sparePartSources');

describe('rows', () => {
  it('builds objects from typed fields, omitting blanks', () => {
    const rows = [
      { ...emptyRow(), fields: { name: ' Lithium ', identifier: '7439-93-2', massKg: '' } },
    ];
    expect(buildRows(material, rows)).toEqual([{ name: 'Lithium', identifier: '7439-93-2' }]);
  });
  it('splits list leaves on commas and nests rows', () => {
    const row = {
      fields: { 'name.de': 'Werk', 'name.en': 'Plant', email: 'a@b.c' },
      nested: { components: [{ fields: { partName: 'Cell', partNumber: 'C-1' }, nested: {} }] },
    };
    expect(buildRows(supplier, [row])).toEqual([
      {
        name: { de: 'Werk', en: 'Plant' },
        email: 'a@b.c',
        components: [{ partName: 'Cell', partNumber: 'C-1' }],
      },
    ]);
    const hazardous = arrayElementLeaves('hazardousSubstances');
    expect(
      buildRows(hazardous, [
        { fields: { name: 'Pb', identifier: '7439-92-1', impacts: 'a, b,,c' }, nested: {} },
      ]),
    ).toEqual([{ name: 'Pb', identifier: '7439-92-1', impacts: ['a', 'b', 'c'] }]);
  });
  it('drops an object whose leaves are all blank', () => {
    const rows = [{ fields: { 'name.de': 'x', 'address.street': '' }, nested: {} }];
    expect(buildRows(supplier, rows)).toEqual([{ name: { de: 'x' } }]);
  });
  it('round-trips an existing value into row drafts', () => {
    const value = [{ name: 'Lithium', identifier: '7439-93-2', massKg: '1.5' }];
    const drafts = rowsFromValue(material, value);
    expect(drafts).toEqual([
      { fields: { name: 'Lithium', identifier: '7439-93-2', massKg: '1.5' }, nested: {} },
    ]);
    expect(buildRows(material, drafts)).toEqual(value);
    const nested = rowsFromValue(supplier, [
      { name: { en: 'P' }, components: [{ partName: 'a', partNumber: 'b' }], website: 'w' },
    ]);
    expect(nested[0]?.nested['components']).toEqual([
      { fields: { partName: 'a', partNumber: 'b' }, nested: {} },
    ]);
  });
  it('checkRows reports per-row issues and returns the parsed value on success', () => {
    const bad = checkRows('criticalRawMaterials', [
      { fields: { name: 'Li', identifier: 'x' }, nested: {} },
      { fields: { name: '', identifier: 'y' }, nested: {} },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]?.row).toBe(1);
    expect(checkRows('criticalRawMaterials', [])).toMatchObject({ ok: false });
    const good = checkRows('criticalRawMaterials', [
      { fields: { name: 'Li', identifier: 'x' }, nested: {} },
    ]);
    expect(good).toEqual({ ok: true, value: [{ name: 'Li', identifier: 'x' }] });
  });
  it('reports a nested row issue attributed to its outer row, with the nested path in the reason', () => {
    const bad = checkRows('sparePartSources', [
      {
        fields: { 'name.de': 'Werk' },
        nested: {
          components: [
            { fields: { partName: 'Cell', partNumber: 'C-1' }, nested: {} },
            { fields: { partName: '', partNumber: 'C-2' }, nested: {} },
          ],
        },
      },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors[0]?.row).toBe(0);
      expect(bad.errors[0]?.reason).toMatch(/^components\.1\.partName/);
    }
  });
});
