import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  emitHtml,
  gapReport,
  type PassportDraft,
  type PassportDraftInput,
  samples,
  VALID_SAMPLE_NAMES,
  validate,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const AS_OF = '2026-09-06T12:00:00Z';

/** The embedded fonts are proven byte for byte below; snapshots keep only the markup and CSS. */
const withoutFonts = (html: string): string =>
  html.replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,<font>');

/** Every href / src value in the document. */
function links(html: string): string[] {
  return [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1] ?? '');
}

describe('emitHtml', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'urn:passwerk:1'])(
    'renders an unsafe identifier as text: %s',
    (uid) => {
      const draft = structuredClone(samples['ev-valid']);
      draft.meta.passportId = uid;
      const html = emitHtml(draft).output;
      expect(links(html)).toEqual([]);
      expect(html).not.toContain('<script>');
      expect(html).toContain('<dd><code>');
    },
  );
  it('retains the report and verdict when the identifier exceeds QR byte capacity', () => {
    const draft = structuredClone(samples['ev-valid']);
    draft.meta.passportId = `https://example.com/${'界'.repeat(900)}`;
    draft.attributes['batteryPassportIdentifier'] = {
      ...draft.attributes['batteryPassportIdentifier'],
      value: draft.meta.passportId,
      status: 'present',
      source: [],
    };
    const result = emitHtml(draft);
    expect(result.verdict).toBe('valid');
    expect(result.findings).toEqual(validate(draft).findings);
    expect(result.output).not.toContain('<svg');
    expect(result.output).toContain('too long for a QR code');
    expect(result.output).toContain('zu lang für einen QR-Code');
    expect(result.output).toContain('</html>');
  });
  for (const name of VALID_SAMPLE_NAMES) {
    it(`${name}: valid, both languages, snapshot in de and en`, () => {
      const de = emitHtml(samples[name], { lang: 'de' });
      const en = emitHtml(samples[name]);
      expect(de.verdict).toBe('valid');
      expect(de.findings).toEqual([]);
      expect(de.output).toContain('id="lang-de" checked');
      expect(en.output).toContain('id="lang-en" checked');
      expect(de.output).toContain('lang="de"');
      expect(de.output).toContain('lang="en"');
      expect(de.output).toContain('<svg');
      expect(withoutFonts(de.output)).toMatchSnapshot();
      expect(withoutFonts(en.output)).toMatchSnapshot();
    });
  }
  it.each([...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES])(
    '%s: the verdict equals validate() for the same clock',
    (name) => {
      const draft =
        name in samples
          ? samples[name as keyof typeof samples]
          : brokenSamples[name as keyof typeof brokenSamples].draft;
      const expected = validate(draft, { asOf: AS_OF });
      const r = emitHtml(draft, { asOf: AS_OF });
      expect(r.verdict).toBe(expected.verdict);
      expect(r.findings.map((f) => f.ruleId)).toEqual(expected.findings.map((f) => f.ruleId));
      for (const f of expected.findings) expect(r.output).toContain(f.ruleId);
      expect(r.output).toContain(AS_OF);
    },
  );
  it('is self-contained: no script, no external stylesheet, the identifier is the only link', () => {
    const draft = samples['ev-valid'];
    const html = emitHtml(draft).output;
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/@import/i);
    // The only url() is an embedded font: nothing is fetched to render the sheet.
    for (const m of html.matchAll(/url\(([^)]*)\)/gi)) {
      expect(m[1]?.startsWith('data:font/woff2;base64,'), m[1]?.slice(0, 40)).toBe(true);
    }
    expect(html).not.toContain('<link');
    for (const l of links(html)) {
      expect(l === draft.meta.passportId || l.startsWith('#'), l).toBe(true);
    }
    // The SVG namespace is the only http:// text.
    expect(html.split('http://').length - 1).toBe(
      html.split('http://www.w3.org/2000/svg').length - 1,
    );
  });
  it('escapes values, labels and the identifier', () => {
    const draft = structuredClone(samples['ev-valid']) as PassportDraftInput;
    (draft.attributes as Record<string, unknown>)['batteryIdentifier'] = {
      value: '<b>&"x"</b>',
      status: 'present',
      source: [],
    };
    const html = emitHtml(draft).output;
    expect(html).toContain('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
    expect(html).not.toContain('<b>&"x"</b>');
  });
  it('embeds the workbench fonts byte for byte', () => {
    const html = emitHtml(samples['ev-valid']).output;
    const embedded = new Map(
      [
        ...html.matchAll(
          /font-family:"([^"]+)";src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g,
        ),
      ].map((m) => [m[1], m[2]]),
    );
    const fontDir = fileURLToPath(new URL('../../../apps/web/src/fonts/', import.meta.url));
    const files = {
      'Space Grotesk': 'space-grotesk.woff2',
      'Space Mono': 'space-mono-regular.woff2',
      Doto: 'doto.woff2',
    };
    expect([...embedded.keys()].sort()).toEqual(Object.keys(files).sort());
    for (const [family, file] of Object.entries(files)) {
      expect(embedded.get(family), family).toBe(
        readFileSync(join(fontDir, file)).toString('base64'),
      );
    }
  });
  it('follows the reader’s colour scheme on screen and prints light', () => {
    const html = emitHtml(samples['ev-valid']).output;
    expect(html).toContain('@media (prefers-color-scheme:dark)');
    expect(html).toMatch(/@media print\{:root\{[^}]*--page:#fff/);
  });
  it('opens with a summary strip: verdict, mandatory and overall completeness', () => {
    const draft = samples['ev-valid'];
    const { completeness } = gapReport(draft as PassportDraft, { report: validate(draft) });
    const html = emitHtml(draft).output;
    expect(html).toContain('<section class="summary">');
    expect(html).toContain('data-verdict="valid"');
    expect(html).toContain('<span lang="de">Gültig</span><span lang="en">Valid</span>');
    for (const c of [completeness.mandatory, completeness.overall]) {
      expect(html).toContain(
        `role="progressbar" aria-valuemin="0" aria-valuemax="${c.total}" aria-valuenow="${c.present}"`,
      );
    }
  });
  it('an invalid passport says so in the summary', () => {
    const name = BROKEN_SAMPLE_NAMES.find(
      (n) => validate(brokenSamples[n].draft).verdict === 'invalid',
    );
    if (!name) throw new Error('no invalid broken sample');
    const html = emitHtml(brokenSamples[name].draft).output;
    expect(html).toContain('data-verdict="invalid"');
    expect(html).toContain('<span lang="de">Ungültig</span><span lang="en">Invalid</span>');
  });
  it('each submodel is a section a reader can fold without script', () => {
    const html = emitHtml(samples['ev-valid']).output;
    expect(html).toMatch(
      /<details class="group" open><summary><span class="name">BatteryNameplate<\/span><span class="label">IDTA 02035-1 · 1\.0<\/span><span class="label count">\d+<\/span><\/summary>/,
    );
  });
  it('flattens a composite value into one path per leaf', () => {
    const html = emitHtml(samples['ev-valid']).output;
    expect(html).toMatch(/<dl class="kv"><dt>address › cityTown<\/dt><dd>[^<]+<\/dd>/);
    expect(html).not.toContain('class="nested"');
  });
  it('prints no time without asOf and is byte-identical across runs', () => {
    const a = emitHtml(samples['industrial-valid']).output;
    expect(a).toBe(emitHtml(samples['industrial-valid']).output);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z<\/(span|td)>/);
  });
});
