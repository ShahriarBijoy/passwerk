import { COMPOSITE_SCHEMAS } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const ok = (id: string, v: unknown) =>
  expect(COMPOSITE_SCHEMAS[id]?.safeParse(v).success, id).toBe(true);
const bad = (id: string, v: unknown) =>
  expect(COMPOSITE_SCHEMAS[id]?.safeParse(v).success, id).toBe(false);

describe('composites for parts 4, 5, 7', () => {
  it('originalPowerCapability: list of SoC/power pairs', () => {
    ok('originalPowerCapability', [{ atSocPercent: '80', powerW: '150000' }]);
    bad('originalPowerCapability', []);
    bad('originalPowerCapability', [{ atSocPercent: '120', powerW: '1' }]);
  });
  it('initialInternalResistance: cell and pack mandatory, module optional', () => {
    ok('initialInternalResistance', { cellOhm: '0.0012', packOhm: '0.085' });
    ok('initialInternalResistance', { cellOhm: '0.0012', packOhm: '0.085', moduleOhm: '0.011' });
    bad('initialInternalResistance', { cellOhm: '0.0012' });
  });
  it('remainingPowerCapability: SoC and percent of original', () => {
    ok('remainingPowerCapability', { atSocPercent: '80', powerPercent: '97.5' });
    bad('remainingPowerCapability', { atSocPercent: '80' });
  });
  it('sparePartSources: supplier with optional address, email, website, components', () => {
    ok('sparePartSources', [
      {
        name: { en: 'Parts GmbH' },
        address: { nationalCode: 'DE', postalCode: '28199', street: 'Werkstrasse 1' },
        email: 'parts@example.test',
        website: 'https://parts.example',
        components: [{ partName: 'Module', partNumber: 'M-1' }],
      },
    ]);
    ok('sparePartSources', [{ name: { de: 'Teile GmbH' } }]);
    bad('sparePartSources', [{ address: { nationalCode: 'DE', postalCode: '1', street: 'x' } }]);
    bad('sparePartSources', []);
  });
  it('componentPartNumbers: flat name/number pairs', () => {
    ok('componentPartNumbers', [{ partName: 'BMS', partNumber: 'BMS-7' }]);
    bad('componentPartNumbers', [{ partName: 'BMS' }]);
  });
});
