import { BROKEN_SAMPLE_NAMES, getSample, VALID_SAMPLE_NAMES } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { exportDraftJson, importDraftJson } from '@/workflow/draftIo.ts';

describe('draft import/export', () => {
  it('imports every golden sample', () => {
    for (const name of [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES]) {
      const r = importDraftJson(JSON.stringify(getSample(name)));
      expect(r.ok, name).toBe(true);
    }
  });
  it('rejects malformed JSON and a schema violation with a bilingual message', () => {
    const a = importDraftJson('{not json');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.message.de.length).toBeGreaterThan(0);
    const b = importDraftJson(JSON.stringify({ meta: {}, attributes: {} }));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.message.en.length).toBeGreaterThan(0);
  });
  it('round-trips', () => {
    const r = importDraftJson(JSON.stringify(getSample('ev-valid')));
    if (!r.ok) throw new Error('import failed');
    const again = importDraftJson(exportDraftJson(r.draft));
    expect(again.ok && exportDraftJson(again.draft)).toBe(exportDraftJson(r.draft));
  });
});
