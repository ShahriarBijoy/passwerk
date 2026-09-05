import { SCHEMA_VERSION } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { derive } from '@/workflow/derive.ts';
import { ingestFiles } from '@/workflow/ingest.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState, type WorkflowState } from '@/workflow/state.ts';

const AT = '2026-09-05T12:00:00Z';
const META = {
  schemaVersion: SCHEMA_VERSION,
  category: 'EV' as const,
  createdAt: AT,
  passportId: 'urn:passwerk:test:reupload',
};

/** Same shape as packages/core/test/fixtures/musterwerk/datasheet-en.csv. */
const csv = (mass: string) => `Parameter;Value;Unit\nBattery mass;${mass};kg\n`;

async function upload(state: WorkflowState, text: string): Promise<WorkflowState> {
  const bytes = new TextEncoder().encode(text);
  const out = await ingestFiles([{ name: 'supplier.csv', bytes, size: bytes.byteLength }], {
    category: 'EV',
  });
  return reduce(state, { type: 'filesIngested', ...out, at: AT });
}

describe('re-uploading a same-named document with different contents', () => {
  it('drops the decision that described the old contents', async () => {
    const started = reduce(initialState, { type: 'startProject', meta: META, at: AT });
    let s = await upload(started, csv('400'));
    const p = s.proposals[0];
    if (!p) throw new Error('expected a proposal for the battery mass row');
    expect(p.value).toBe('400');

    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: p.attributeId, factId: p.factId },
      at: AT,
    });
    expect(derive(s, AT)?.draft.attributes[p.attributeId]?.value).toBe('400');

    s = await upload(s, csv('450'));
    // The re-uploaded file produces the same fact id (`name#page:ordinal`, no content hash),
    // so nothing but the document hash can tell the reducer the decision is stale.
    expect(s.proposals.map((x) => x.factId)).toContain(p.factId);
    expect(s.decisions).toEqual({});
    expect(derive(s, AT)?.draft.attributes[p.attributeId]).toBeUndefined();
  });
});
