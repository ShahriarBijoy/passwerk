import {
  attributes,
  BATTERY_CATEGORIES,
  carrierSchemes,
  getAttribute,
  getAttributesForCategory,
  getAttributesForTemplatePath,
  getCarrierScheme,
  getEcDataPoint,
  getRule,
  getTemplate,
  getTemplateElement,
  getTimeline,
  listCapabilities,
  PACKAGE_NAME,
  templates,
} from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('@passwerk/rules public API', () => {
  it('exposes its package name and the three passport categories', () => {
    expect(PACKAGE_NAME).toBe('@passwerk/rules');
    expect(BATTERY_CATEGORIES).toEqual(['EV', 'LMT', 'INDUSTRIAL_GT_2KWH']);
  });

  it('bundles the seven templates with their environments and element indexes', () => {
    expect(templates.map((t) => t.part)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const t of templates) {
      expect(Array.isArray(t.environment.submodels)).toBe(true);
      expect(t.catalogue.elementCount).toBe(t.catalogue.elements.length);
    }
    expect(getTemplate(6)?.version).toBe('1.0.1');
    expect(getTemplate(5)?.submodelSemanticId).toContain('product_condition:1.0.2');
  });

  it('resolves all 93 attributes with longlist row, EC data points, applicability and template elements', () => {
    expect(attributes).toHaveLength(93);
    expect(attributes.map((a) => a.din.no)).toEqual(Array.from({ length: 93 }, (_, i) => i + 1));
    for (const a of attributes) {
      expect(a.din.row.no).toBe(a.din.no);
      expect(a.ec.length).toBe(a.ecDataPoints.length);
      expect(a.templateElements.length).toBe(a.templatePaths.length);
      for (const cat of BATTERY_CATEGORIES) expect(a.applicability[cat].status).toBeTruthy();
      if (a.ec.length > 0) expect(a.legalRefs.length, a.id).toBeGreaterThan(0);
    }
  });

  it('derives applicability from the primary EC data point', () => {
    const mass = getAttribute('batteryMass');
    expect(mass?.applicabilitySource).toBe('ec');
    expect(mass?.applicability.LMT.status).toBe('mandatory');
    expect(mass?.legalRefs[0]).toBe('BR Annex VI Part A (5)');
    expect(mass?.dynamic).toBe(false);

    const soce = getAttribute('stateOfCertifiedEnergy');
    expect(soce?.applicability.EV.status).toBe('mandatory');
    expect(soce?.applicability.LMT.status).toBe('not_displayed');
    expect(soce?.dynamic).toBe(true);

    const cobalt = getAttribute('recycledCobaltPreConsumer');
    expect(cobalt?.applicability.EV.status).toBe('not_yet_applicable');
  });

  it('falls back to the authored override for DIN-only attributes', () => {
    const a = getAttribute('energyThroughput');
    expect(a?.applicabilitySource).toBe('override');
    expect(a?.applicability.EV.status).toBe('not_displayed');
    expect(a?.applicability.LMT.status).toBe('conditional');
    expect(a?.verify).toBe(true);
  });

  it('filters attributes by category and status', () => {
    const mandatoryEv = getAttributesForCategory('EV');
    const mandatoryLmt = getAttributesForCategory('LMT');
    expect(mandatoryEv.length).toBeGreaterThan(30);
    expect(mandatoryEv.map((a) => a.id)).toContain('stateOfCertifiedEnergy');
    expect(mandatoryLmt.map((a) => a.id)).not.toContain('stateOfCertifiedEnergy');
    expect(mandatoryLmt.map((a) => a.id)).toContain('remainingCapacity');
    const deferred = getAttributesForCategory('INDUSTRIAL_GT_2KWH', ['not_yet_applicable']);
    expect(deferred.map((a) => a.id)).toContain('carbonFootprintPerFunctionalUnit');
  });

  it('looks up template elements, EC data points and rules', () => {
    const el = getTemplateElement('4/GeneralInformation/BatteryMass');
    expect(el?.concept?.unit).toBe('kilogram');
    expect(el?.valueType).toBe('xs:float');
    expect(
      getAttributesForTemplatePath('4/GeneralInformation/BatteryMass').map((a) => a.id),
    ).toEqual(['batteryMass']);
    expect(getEcDataPoint(77)).toBeUndefined();
    expect(getEcDataPoint(1)?.legalRef).toBe('BR Article 77(3)');
    expect(getRule('PW-PLAUS-002')?.attributes).toContain('nominalVoltage');
  });

  it('returns the timeline sorted by date, filterable by category', () => {
    const all = getTimeline();
    expect(all.map((e) => e.date)).toEqual([...all.map((e) => e.date)].sort());
    expect(all.find((e) => e.id === 'battery-passport')?.date).toBe('2027-02-18');
    const lmt = getTimeline('LMT');
    expect(lmt.map((e) => e.id)).not.toContain('cf-max-threshold-ev');
  });

  it('reports capabilities with pinned template checksums', () => {
    const c = listCapabilities();
    expect(c.templates).toHaveLength(7);
    for (const t of c.templates) expect(t.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(c.aasSchemaVersions).toEqual(['3.0.9', '3.1.2']);
    expect(c.ecGuidance).toEqual({ version: '2.0', date: '2026-08-15', dataPoints: 71 });
    expect(c.knowledgeBase.attributes).toBe(93);
    expect(c.knowledgeBase.dinLonglistRows).toBe(93);
    expect(c.knowledgeBase.languages).toEqual(['de', 'en']);
  });

  it('bundles the two carrier schemes, both languages, marked verify', () => {
    expect(carrierSchemes.map((s) => s.id)).toEqual([
      'gs1-digital-link-gtin-serial',
      'gs1-digital-link-giai',
    ]);
    for (const s of carrierSchemes) {
      expect(s.verify).toBe(true);
      expect(s.pattern).toMatch(/^https:\/\/\{resolverBase\}\//);
      for (const text of [s.name, s.explanation, s.whoTypicallyHasIt]) {
        expect(text.de.length).toBeGreaterThan(0);
        expect(text.en.length).toBeGreaterThan(0);
      }
    }
    expect(getCarrierScheme('gs1-digital-link-giai')?.pattern).toBe(
      'https://{resolverBase}/8004/{giai}',
    );
    expect(getCarrierScheme('nope')).toBeUndefined();
  });
});
