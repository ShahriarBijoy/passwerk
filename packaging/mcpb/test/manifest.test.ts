import { TOOLS } from '@passwerk/server';
import { describe, expect, it } from 'vitest';

describe('packaging workspace wiring', () => {
  it('resolves the server registry from a packaging test', () => {
    expect(TOOLS.map((t) => t.name)).toContain('ingest_documents');
  });
});
