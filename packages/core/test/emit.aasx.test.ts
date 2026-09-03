import {
  AASX_SPEC_PART,
  emitAasJson,
  emitAasx,
  readAasxEnvironment,
  samples,
  validateEnvironmentJson,
} from '@passwerk/core';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

describe('emitAasx', () => {
  const r = emitAasx(samples['ev-valid']);
  const entries = unzipSync(r.output);
  const text = (name: string) => {
    const bytes = entries[name];
    if (!bytes) throw new Error(`missing zip entry ${name}`);
    return strFromU8(bytes);
  };
  it('has the OPC layout of the official packages, in fixed order', () => {
    expect(Object.keys(entries)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'aasx/aasx-origin',
      'aasx/_rels/aasx-origin.rels',
      AASX_SPEC_PART,
    ]);
    expect(text('_rels/.rels')).toContain('http://admin-shell.io/aasx/relationships/aasx-origin');
    expect(text('aasx/_rels/aasx-origin.rels')).toContain(`Target="/${AASX_SPEC_PART}"`);
    expect(text('aasx/_rels/aasx-origin.rels')).toContain(
      'http://admin-shell.io/aasx/relationships/aas-spec',
    );
    expect(text('[Content_Types].xml')).toContain(
      'Extension="json" ContentType="application/json"',
    );
    expect(text('[Content_Types].xml')).toContain('PartName="/aasx/aasx-origin"');
  });
  it('carries the same canonical JSON as emitAasJson', () => {
    expect(text(AASX_SPEC_PART)).toBe(emitAasJson(samples['ev-valid']).output);
  });
  it('re-validates its own output and is byte-identical across runs', () => {
    expect(r.verdict).toBe('valid');
    expect(validateEnvironmentJson(readAasxEnvironment(r.output)).findings).toEqual([]);
    expect(Buffer.from(emitAasx(samples['ev-valid']).output).equals(Buffer.from(r.output))).toBe(
      true,
    );
  });
  it('reports invalid when the draft has value errors', () => {
    const broken = emitAasx({
      ...samples['lmt-valid'],
      attributes: {
        ...samples['lmt-valid'].attributes,
        manufacturingDate: { value: '01.03.2026', status: 'present' },
      },
    });
    expect(broken.verdict).toBe('invalid');
    expect(broken.output.length).toBeGreaterThan(0);
  });
});
