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
