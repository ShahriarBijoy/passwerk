/**
 * Sovereignty proof (BUILD_PLAN 1.3, ADR D-013): the whole public surface of core and rules
 * runs with zero network attempts. Guards sit at the socket and resolver level so that http,
 * https, tls, undici/fetch and any transitive library are all caught. The Docker
 * `--network none` CI job is the hard proof; this test is the fast, cross-platform one.
 * Phase 4 extends the exercised surface to ingest (including the lazily loaded pdfjs engine),
 * extract and mapping. Phase 6 extends it further to every MCP tool, resource and prompt.
 */

import dns from 'node:dns';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { join } from 'node:path';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

interface Attempt {
  api: string;
  target: string;
}

const attempts: Attempt[] = [];
const restores: Array<() => void> = [];

function guard<T extends object>(obj: T, key: keyof T, api: string): void {
  const original = obj[key];
  const blocked = (...args: unknown[]) => {
    attempts.push({ api, target: String(args[0] ?? '') });
    throw new Error(`passwerk sovereignty: network attempt via ${api}`);
  };
  (obj as Record<keyof T, unknown>)[key] = blocked;
  restores.push(() => {
    (obj as Record<keyof T, unknown>)[key] = original;
  });
}

beforeAll(() => {
  guard(net.Socket.prototype, 'connect', 'net.Socket.prototype.connect');
  guard(tls, 'connect', 'tls.connect');
  guard(dns, 'lookup', 'dns.lookup');
  guard(dns, 'resolve', 'dns.resolve');
  guard(dns, 'resolve4', 'dns.resolve4');
  guard(dns, 'resolve6', 'dns.resolve6');
  guard(dns.promises, 'lookup', 'dns.promises.lookup');
  guard(dns.promises, 'resolve', 'dns.promises.resolve');
  guard(dns.promises, 'resolve4', 'dns.promises.resolve4');
  guard(dns.promises, 'resolve6', 'dns.promises.resolve6');
  guard(http, 'request', 'http.request');
  guard(http, 'get', 'http.get');
  guard(https, 'request', 'https.request');
  guard(https, 'get', 'https.get');
  guard(globalThis, 'fetch', 'fetch');
});

afterAll(() => {
  for (const restore of restores.reverse()) restore();
});

describe('sovereignty: zero network attempts', () => {
  it('the guards record and block a real attempt (self-check)', () => {
    expect(() => fetch('http://127.0.0.1:9/')).toThrow('passwerk sovereignty');
    expect(() => http.get('http://127.0.0.1:9/')).toThrow('passwerk sovereignty');
    expect(() => new net.Socket().connect(9, '127.0.0.1')).toThrow('passwerk sovereignty');
    expect(attempts.map((a) => a.api)).toEqual([
      'fetch',
      'http.get',
      'net.Socket.prototype.connect',
    ]);
    attempts.length = 0;
  });

  it('loading and exercising the whole public surface of rules and core makes no attempt', {
    timeout: 20000,
  }, async () => {
    vi.resetModules();
    const rules = await import('@passwerk/rules');
    const core = await import('@passwerk/core');

    // rules: every accessor over every id
    expect(rules.artefactManifest.artefacts.length).toBeGreaterThan(0);
    expect(rules.templates.length).toBe(7);
    for (const attribute of rules.attributes) {
      expect(rules.getAttribute(attribute.id)).toBeDefined();
      for (const path of attribute.templatePaths) rules.getTemplateElement(path);
    }
    for (const template of rules.templateCatalogue.templates) {
      expect(rules.getTemplate(template.part)).toBeDefined();
      for (const element of template.elements) {
        expect(rules.getTemplateElement(element.path)).toBeDefined();
        rules.getAttributesForTemplatePath(element.path);
      }
    }
    for (const point of rules.ecDataPoints.dataPoints) rules.getEcDataPoint(point.number);
    for (const rule of rules.plausibilityRules) rules.getRule(rule.id);
    for (const category of rules.BATTERY_CATEGORIES) {
      rules.getAttributesForCategory(category);
      rules.getTimeline(category);
    }
    rules.getTimeline();
    expect(rules.listCapabilities().sovereignty).toBeTypeOf('string');

    // core: every entry point over every sample, JSON and AASX
    for (const name of [...core.VALID_SAMPLE_NAMES, ...core.BROKEN_SAMPLE_NAMES]) {
      const draft = core.getSample(name);
      const report = core.validate(draft);
      expect(report.aasJson).toBeDefined();
      const aasJson = report.aasJson as string;
      const jsonable = JSON.parse(aasJson);
      core.validateSchema(draft);
      core.validateAas(jsonable);
      core.validateTemplate(jsonable);
      core.validateEnvironmentJson(jsonable);
      core.readAasxEnvironment(core.packAasx(aasJson));
      if (report.layers.L1.errors === 0) {
        core.emitAasJson(draft);
        core.readAasxEnvironment(core.emitAasx(draft).output);
      }
    }

    // Phase 4: ingest, extract, mapping over every fixture (files read here with node:fs, in the test only)
    const fixtureDir = join(import.meta.dirname, 'fixtures', 'musterwerk');
    const names = [
      'lieferantenerklaerung.pdf',
      'stueckliste.xlsx',
      'energierechnung.pdf',
      'datasheet-en.csv',
      'handover-notes.docx',
    ];
    const bundle = await core.ingest(
      names.map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(fixtureDir, name))) })),
    );
    const facts = core.extractFacts(bundle);
    const proposals = core.suggestMappings(facts, { category: 'EV' });
    const draft = core.applyMappings(
      core.newDraft({
        schemaVersion: '1.0',
        category: 'EV',
        createdAt: '2026-09-04T00:00:00Z',
        passportId: 'https://passport.musterwerk.example/battery/MW-EV-2026-000123',
      }),
      proposals
        .filter((p) => p.confidence >= 0.7)
        .map((p) => ({
          attributeId: p.attributeId,
          value: p.value,
          ...(p.unit ? { unit: p.unit } : {}),
          ...(p.path ? { path: p.path } : {}),
          source: p.source,
          confidence: p.confidence,
        })),
    ).draft;
    core.validate(draft);
    for (const doc of bundle.documents) core.documentRefFromIngest(doc);

    // Phase 5: L4 plausibility, gap report, obligations and explain over every sample and id
    for (const name of [...core.VALID_SAMPLE_NAMES, ...core.BROKEN_SAMPLE_NAMES]) {
      const sampleDraft = core.PassportDraft.parse(core.getSample(name));
      core.validatePlausibility(sampleDraft);
      core.gapReport(sampleDraft, { report: core.validate(sampleDraft) });
    }
    core.checkObligations({ batteryType: 'EV', role: 'manufacturer', asOf: '2027-03-01' });
    for (const attribute of rules.attributes) core.explainAttribute(attribute.id);
    for (const rule of rules.plausibilityRules) core.explainRule(rule.id);

    expect(attempts).toEqual([]);
  });
});
