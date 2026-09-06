import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  emitHtml,
  type PassportDraftInput,
  samples,
  VALID_SAMPLE_NAMES,
  validate,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const AS_OF = '2026-09-06T12:00:00Z';

/** Every href / src value in the document. */
function links(html: string): string[] {
  return [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1] ?? '');
}

describe('emitHtml', () => {
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
      expect(de.output).toMatchSnapshot();
      expect(en.output).toMatchSnapshot();
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
    expect(html).not.toMatch(/@import|url\(/i);
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
  it('prints no time without asOf and is byte-identical across runs', () => {
    const a = emitHtml(samples['industrial-valid']).output;
    expect(a).toBe(emitHtml(samples['industrial-valid']).output);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z<\/(span|td)>/);
  });
});
