import { run } from '@passwerk/cli';
import type { GapItem, GapReport } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { gapExitCode, gapLines } from '../src/commands/gaps.ts';
import { captureIo, sampleFiles } from './harness.ts';

const files = sampleFiles();

describe('passwerk gaps', () => {
  it('an AAS-valid golden draft still has open required items (D-023): exit 1, deferred counted not listed', async () => {
    const io = captureIo(files);
    expect(await run(['gaps', 'samples/ev-valid.json'], io)).toBe(1);
    expect(io.out()).toMatch(/^Mandatory \d+\/\d+ \(\d+(\.\d+)? %\)/);
    expect(io.out()).toContain('Not legal advice');
    expect(io.out()).toMatch(/Open required: [1-9]\d*\./);
    expect(io.out()).toMatch(/[1-9]\d* deferred data point/);
    expect(io.out()).not.toMatch(/\[deferred,/);
    expect(io.out()).toMatch(/^- operatorIdentifier \(.+\) \[required, missing\]/m);
  });

  it('exits 0 when no required item is open, whatever the deferred and optional ones say', () => {
    const item = (attributeId: string, bucket: string, status: string) =>
      ({
        attributeId,
        bucket,
        status,
        name: { de: attributeId, en: attributeId },
        legalRefs: [],
        suggestedAction: { de: '', en: '' },
      }) as unknown as GapItem;
    const gap = {
      completeness: {
        mandatory: { present: 1, total: 2, percent: '50' },
        overall: { present: 1, total: 4, percent: '25' },
      },
      items: [
        item('a', 'required', 'present'),
        item('b', 'deferred', 'missing'),
        item('c', 'optional', 'missing'),
        item('d', 'conditional', 'missing'),
      ],
      byDataOwner: [{ owner: { de: 'X', en: 'X' }, attributeIds: ['a', 'b', 'c', 'd'] }],
    } as unknown as GapReport;
    expect(gapExitCode(gap)).toBe(0);
    expect(gapLines(gap, 'en')[0]).toMatch(/Open required: 0\. 1 deferred/);
    expect(gapExitCode({ ...gap, items: [...gap.items, item('e', 'required', 'invalid')] })).toBe(
      1,
    );
  });

  it('open mandatory gaps exit 1 and are grouped by data owner with legal references', async () => {
    const io = captureIo(files);
    expect(await run(['gaps', 'samples/lmt-missing-state-of-charge.json'], io)).toBe(1);
    const out = io.out();
    expect(out).toMatch(/^Mandatory \d+\/\d+ \(\d+(\.\d+)? %\)/);
    expect(out).toMatch(/^## .+/m);
    expect(out).toMatch(/Open required: [1-9]\d*\./);
    expect(out).toMatch(/^- stateOfCharge \(.+\) \[conditional, missing\]: .+Annex/m);
    expect(out).toMatch(/^- sparePartSources \(.+\) \[required, missing\]/m);
  });

  it('--lang de uses German owner names and headings', async () => {
    const io = captureIo(files);
    await run(['gaps', 'samples/lmt-missing-state-of-charge.json', '--lang', 'de'], io);
    expect(io.out()).toMatch(/^Pflichtangaben /);
  });

  it('--json carries the report with byDataOwner', async () => {
    const io = captureIo(files);
    expect(await run(['gaps', 'samples/lmt-missing-state-of-charge.json', '--json'], io)).toBe(1);
    const parsed = JSON.parse(io.out()) as { byDataOwner: unknown[]; isNotLegalAdvice: boolean };
    expect(parsed.byDataOwner.length).toBeGreaterThan(0);
    expect(parsed.isNotLegalAdvice).toBe(true);
  });

  it('an unreadable draft is a usage error (3)', async () => {
    const io = captureIo(files);
    expect(await run(['gaps', 'samples/nope.json'], io)).toBe(3);
  });
});
