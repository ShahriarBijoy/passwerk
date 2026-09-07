import { describe, expect, it } from 'vitest';
import { derive } from '@/workflow/derive/index.ts';
import { ingestFiles } from '@/workflow/ingest.ts';
import { defaultProject } from '@/workflow/project.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState, type WorkflowState } from '@/workflow/state.ts';

const AT = '2026-09-05T12:00:00Z';
const PROJECT = defaultProject('urn:passwerk:test:reupload', '');

/** Same shape as packages/core/test/fixtures/musterwerk/datasheet-en.csv. */
const csv = (mass: string) => `Parameter;Value;Unit\nBattery mass;${mass};kg\n`;

async function upload(state: WorkflowState, text: string): Promise<WorkflowState> {
  const bytes = new TextEncoder().encode(text);
  const out = await ingestFiles([{ name: 'supplier.csv', bytes, size: bytes.byteLength }]);
  return reduce(state, { type: 'filesIngested', ...out, at: AT });
}

describe('re-uploading a same-named document with different contents', () => {
  it('drops the decision that described the old contents', async () => {
    const started = reduce(initialState, { type: 'setProject', project: PROJECT, at: AT });
    let s = await upload(started, csv('400'));
    const d1 = derive(s, AT);
    if (!d1) throw new Error('expected a derived bundle');
    const p = d1.proposals[0];
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
    const d2 = derive(s, AT);
    expect(d2?.proposals.map((x) => x.factId)).toContain(p.factId);
    expect(s.decisions).toEqual({});
    expect(d2?.draft.attributes[p.attributeId]).toBeUndefined();
  });
});
