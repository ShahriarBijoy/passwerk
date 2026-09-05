import { brokenSamples, gapReport, PassportDraft, samples, validate } from '@passwerk/core';
import { attributes } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const parse = (name: 'ev-valid' | 'lmt-valid' | 'industrial-valid') =>
  PassportDraft.parse(samples[name]);

describe('gapReport', () => {
  it('covers every knowledge-base attribute exactly once', () => {
    const ids = gapReport(parse('ev-valid')).items.map((i) => i.attributeId);
    expect(ids).toHaveLength(attributes.length);
    expect(new Set(ids).size).toBe(attributes.length);
  });

  it('buckets by the effective applicability for the draft category', () => {
    const items = gapReport(parse('ev-valid')).items;
    const byId = new Map(items.map((i) => [i.attributeId, i]));
    expect(byId.get('batteryMass')?.bucket).toBe('required');
    // Deferred: the Commission marks the recycled-content shares not yet applicable.
    expect(byId.get('recycledCobaltPreConsumer')?.bucket).toBe('deferred');
  });

  it('never counts a deferred or optional attribute toward completeness', () => {
    const r = gapReport(parse('industrial-valid'));
    const counted = r.items.filter((i) => i.bucket === 'required').length;
    expect(r.completeness.mandatory.total).toBe(counted);
    const overall = r.items.filter(
      (i) => i.bucket === 'required' || i.bucket === 'conditional',
    ).length;
    expect(r.completeness.overall.total).toBe(overall);
  });

  it('reports percent as a decimal string with one fractional digit', () => {
    const r = gapReport(parse('lmt-valid'));
    expect(r.completeness.mandatory.percent).toMatch(/^\d+\.\d$/);
    expect(Number(r.completeness.mandatory.percent)).toBeGreaterThan(0);
  });

  it('marks an attribute with an error finding as invalid, not present', () => {
    const draft = PassportDraft.parse(brokenSamples['lmt-wrong-date-format'].draft);
    const r = gapReport(draft, { report: validate(draft) });
    const item = r.items.find((i) => i.attributeId === 'manufacturingDate');
    expect(item?.status).toBe('invalid');
    expect(item?.findings.length).toBeGreaterThan(0);
  });

  it('does not mark an attribute with only a warning finding as invalid', () => {
    const draft = PassportDraft.parse(brokenSamples['ev-document-without-classification'].draft);
    const r = gapReport(draft, { report: validate(draft) });
    const item = r.items.find((i) => i.attributeId === 'euDeclarationOfConformity');
    expect(item?.status).not.toBe('invalid');
    expect(item?.findings.length).toBeGreaterThan(0);
  });

  it('never splices a full-sentence data-holder into the middle of a clause', () => {
    // Regression pin: whoTypicallyHasIt strings are full sentences ending in ".", so a
    // missing/required suggestedAction must not read as "... from <Sentence.>." or
    // "... bei <Satz.> anfordern." (a dative preposition before a capitalised sentence).
    const r = gapReport(parse('ev-valid'));
    const item = r.items.find((i) => i.status === 'missing' && i.bucket === 'required');
    expect(item).toBeDefined();
    expect(item?.suggestedAction.en).not.toMatch(/\.\./);
    expect(item?.suggestedAction.de).not.toMatch(/\.\./);
    expect(item?.suggestedAction.de).not.toMatch(/bei Das/);
  });

  describe('deferred wording follows the Commission verdict, not just the bucket', () => {
    const deferred = (attributeId: string) => {
      const item = gapReport(parse('ev-valid')).items.find((i) => i.attributeId === attributeId);
      expect(item?.bucket, attributeId).toBe('deferred');
      return item;
    };

    it("attributes 'not yet applicable' correctly for a value already held", () => {
      // 18 of the 27 deferred items on ev-valid are not_yet_applicable, and most of them
      // already carry a value. Telling their holder the Commission says "not to be filled or
      // displayed", or speaking of an "absence", states the wrong verdict about a value the
      // supplier has.
      const item = deferred('carbonFootprintPerFunctionalUnit');
      expect(item?.applicability).toBe('not_yet_applicable');
      expect(item?.status).toBe('present');
      expect(item?.suggestedAction.en).toBe(
        'No action. This data point is not yet applicable for this battery category; the value you already hold is informational until the enabling act applies.',
      );
      expect(item?.suggestedAction.de).toBe(
        'Keine Aktion. Dieser Datenpunkt ist für diese Batteriekategorie noch nicht anwendbar; der bereits vorliegende Wert ist bis zum Geltungsbeginn des Rechtsakts informativ.',
      );
      expect(item?.suggestedAction.en).not.toContain('not to be filled');
      expect(item?.suggestedAction.de).not.toContain('nicht auszufüllen');
    });

    it("points a missing 'not yet applicable' item at the obligations timeline", () => {
      const item = deferred('carbonFootprintLabel');
      expect(item?.applicability).toBe('not_yet_applicable');
      expect(item?.status).toBe('missing');
      expect(item?.suggestedAction.en).toBe(
        'No action yet. The Commission marks this data point as not yet applicable for this battery category; it becomes relevant on a later date (see the obligations timeline), so its absence is not a gap today.',
      );
      expect(item?.suggestedAction.de).toBe(
        'Noch keine Aktion. Die Kommission stuft diesen Datenpunkt für diese Batteriekategorie als noch nicht anwendbar ein; er wird zu einem späteren Zeitpunkt relevant (siehe Pflichten-Zeitplan), sein Fehlen ist heute keine Lücke.',
      );
    });

    it("keeps the established wording for a missing 'not displayed' item", () => {
      const item = deferred('dateOfPuttingIntoService');
      expect(item?.applicability).toBe('not_displayed');
      expect(item?.status).toBe('missing');
      expect(item?.suggestedAction.en).toBe(
        'No action. The Commission marks this data point as not to be filled or displayed for this battery category, so its absence is not a gap.',
      );
      expect(item?.suggestedAction.de).toBe(
        'Keine Aktion. Die Kommission stuft diesen Datenpunkt für diese Batteriekategorie als nicht auszufüllen bzw. nicht anzuzeigen ein; sein Fehlen ist keine Lücke.',
      );
    });

    it("does not speak of absence for a 'not displayed' value that is present", () => {
      // energyThroughput is not_displayed for EV and still filled in ev-valid; the four
      // state-of-health blocks were removed from the sample because PW-PLAUS-012 warns on them.
      const item = deferred('energyThroughput');
      expect(item?.applicability).toBe('not_displayed');
      expect(item?.status).toBe('present');
      expect(item?.suggestedAction.en).toBe(
        'No action. The Commission marks this data point as not to be filled or displayed for this battery category; the value you hold is not a passport requirement.',
      );
      expect(item?.suggestedAction.de).toBe(
        'Keine Aktion. Die Kommission stuft diesen Datenpunkt für diese Batteriekategorie als nicht auszufüllen bzw. nicht anzuzeigen ein; der vorliegende Wert ist keine Passanforderung.',
      );
      expect(item?.suggestedAction.en).not.toContain('absence');
      expect(item?.suggestedAction.de).not.toContain('Fehlen');
    });
  });

  it('carries legal references, who-has-it and a DE/EN suggested action', () => {
    const item = gapReport(parse('ev-valid')).items.find((i) => i.attributeId === 'batteryMass');
    expect(item?.legalRefs.length).toBeGreaterThan(0);
    expect(item?.whoTypicallyHasIt.de.length).toBeGreaterThan(0);
    expect(item?.suggestedAction.de.length).toBeGreaterThan(0);
    expect(item?.suggestedAction.en.length).toBeGreaterThan(0);
  });

  it('groups by submodel and by data owner without losing an item', () => {
    const r = gapReport(parse('ev-valid'));
    const inSubmodels = r.bySubmodel.flatMap((g) => g.attributeIds);
    const inOwners = r.byDataOwner.flatMap((g) => g.attributeIds);
    expect(inSubmodels.sort()).toEqual(r.items.map((i) => i.attributeId).sort());
    expect(inOwners.sort()).toEqual(r.items.map((i) => i.attributeId).sort());
  });

  it('is deterministic', () => {
    expect(JSON.stringify(gapReport(parse('ev-valid')))).toBe(
      JSON.stringify(gapReport(parse('ev-valid'))),
    );
  });

  it('states that it is not legal advice', () => {
    expect(gapReport(parse('ev-valid')).isNotLegalAdvice).toBe(true);
  });
});
