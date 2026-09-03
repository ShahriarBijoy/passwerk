/**
 * Structural checks for kb/rules.json and kb/timeline.json: every cross-reference to an
 * attribute id resolves, vocabularies are respected, dates are ISO.
 */

import { attributes, plausibilityRules, timeline } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const ids = new Set(attributes.map((a) => a.id));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('kb/rules.json', () => {
  it('has sequential PW-PLAUS ids and both severities', () => {
    expect(plausibilityRules.length).toBeGreaterThanOrEqual(10);
    plausibilityRules.forEach((r, i) => {
      expect(r.id).toBe(`PW-PLAUS-${String(i + 1).padStart(3, '0')}`);
      expect(['error', 'warning']).toContain(r.severity);
    });
  });

  it('every rule has DE and EN title, message and fix hint, and references known attributes', () => {
    for (const r of plausibilityRules) {
      for (const field of ['title', 'message', 'fixHint'] as const) {
        expect(r[field].en.length, `${r.id}.${field}.en`).toBeGreaterThan(5);
        expect(r[field].de.length, `${r.id}.${field}.de`).toBeGreaterThan(5);
      }
      expect(r.attributes.length, `${r.id} attributes`).toBeGreaterThan(0);
      for (const id of r.attributes) expect(ids.has(id), `${r.id} -> ${id}`).toBe(true);
    }
  });
});

describe('kb/timeline.json', () => {
  it('has unique ids, ISO dates, known statuses and categories', () => {
    const seen = new Set<string>();
    for (const e of timeline.events) {
      expect(seen.has(e.id), `duplicate ${e.id}`).toBe(false);
      seen.add(e.id);
      expect(e.date, e.id).toMatch(ISO_DATE);
      expect(['fixed', 'latest_of']).toContain(e.dateRule);
      if (e.dateRule === 'latest_of') expect(e.alternative, `${e.id} alternative`).toBeTruthy();
      expect(['in_force', 'scheduled', 'pending_act', 'superseded']).toContain(e.status);
      expect(e.appliesTo.length, e.id).toBeGreaterThan(0);
      expect(e.title.en.length).toBeGreaterThan(5);
      expect(e.title.de.length).toBeGreaterThan(5);
      expect(e.legalRef.length).toBeGreaterThan(3);
      for (const id of e.affectsAttributes) expect(ids.has(id), `${e.id} -> ${id}`).toBe(true);
    }
    expect(timeline.lastVerified).toMatch(ISO_DATE);
  });

  it('pins the hard passport date and the postponed due diligence date', () => {
    expect(timeline.events.find((e) => e.id === 'battery-passport')?.date).toBe('2027-02-18');
    expect(timeline.events.find((e) => e.id === 'due-diligence-obligations')?.date).toBe(
      '2027-08-18',
    );
    expect(
      timeline.events.find((e) => e.id === 'recycled-content-minimum-2031')?.thresholds,
    ).toEqual({
      cobalt: 16,
      lead: 85,
      lithium: 6,
      nickel: 6,
    });
  });
});
