import { buildGs1DigitalLink, SCHEMA_VERSION } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { defaultProject, metaOf, passportIdOf, projectFromMeta } from '@/workflow/project.ts';

// After the 2027-02-18 obligation start (packages/core/src/obligations/check.ts), so EV reads "required".
const AT = '2027-09-07T12:00:00Z';

describe('passportIdOf', () => {
  it('builds a GS1 Digital Link from GTIN and serial through core', () => {
    const r = passportIdOf({
      mode: 'gs1',
      resolverBase: 'https://id.example.com',
      gtin: '96385074',
      serial: 'SN-1',
    });
    expect(r).toEqual({
      ok: true,
      passportId: buildGs1DigitalLink('https://id.example.com', {
        gtin: '96385074',
        serial: 'SN-1',
      }),
      digitalLink: buildGs1DigitalLink('https://id.example.com', {
        gtin: '96385074',
        serial: 'SN-1',
      }),
    });
  });
  it('builds a GIAI link', () => {
    const r = passportIdOf({
      mode: 'gs1-giai',
      resolverBase: 'https://id.example.com/',
      giai: 'A1',
    });
    expect(r.ok && r.passportId).toBe('https://id.example.com/8004/A1');
  });
  it('reports the carrier error text in both languages for a wrong check digit', () => {
    const r = passportIdOf({
      mode: 'gs1',
      resolverBase: 'https://id.example.com',
      gtin: '96385075',
      serial: 'SN-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message.de).toContain('Prüfziffer');
      expect(r.message.en).toContain('check digit');
    }
  });
  it('accepts an https URI and rejects http', () => {
    expect(passportIdOf({ mode: 'https', uri: ' https://p.example/x ' })).toEqual({
      ok: true,
      passportId: 'https://p.example/x',
    });
    const r = passportIdOf({ mode: 'https', uri: 'http://p.example/x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.en).toBe('Must be an absolute https URI.');
  });
  it('accepts a urn draft identifier and rejects plain text', () => {
    expect(passportIdOf({ mode: 'draft', urn: 'urn:passwerk:draft:1' })).toEqual({
      ok: true,
      passportId: 'urn:passwerk:draft:1',
    });
    expect(passportIdOf({ mode: 'draft', urn: 'hello' }).ok).toBe(false);
  });
});

describe('project helpers', () => {
  it('defaultProject is an EV manufacturer with a draft identifier', () => {
    expect(defaultProject('urn:x', AT)).toEqual({
      batteryType: 'EV',
      role: 'manufacturer',
      identifier: { mode: 'draft', urn: 'urn:x' },
      createdAt: AT,
    });
  });
  it('projectFromMeta maps the category back and detects the identifier mode', () => {
    const p = projectFromMeta({
      schemaVersion: SCHEMA_VERSION,
      category: 'INDUSTRIAL_GT_2KWH',
      passportId: 'https://p.example/1',
      createdAt: AT,
    });
    expect(p).toEqual({
      batteryType: 'INDUSTRIAL',
      role: 'manufacturer',
      manualCategory: 'INDUSTRIAL_GT_2KWH',
      identifier: { mode: 'https', uri: 'https://p.example/1' },
      createdAt: AT,
    });
    const d = projectFromMeta({
      schemaVersion: SCHEMA_VERSION,
      category: 'LMT',
      passportId: 'urn:passwerk:draft:2',
      createdAt: AT,
    });
    expect(d.batteryType).toBe('LMT');
    expect(d.identifier).toEqual({ mode: 'draft', urn: 'urn:passwerk:draft:2' });
  });
  it('metaOf carries createdAt from the project', () => {
    expect(metaOf(defaultProject('urn:x', AT), 'EV', 'urn:x')).toEqual({
      schemaVersion: SCHEMA_VERSION,
      category: 'EV',
      passportId: 'urn:x',
      createdAt: AT,
    });
  });
});
