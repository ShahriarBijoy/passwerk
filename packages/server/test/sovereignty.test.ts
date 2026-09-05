/**
 * Sovereignty proof for the server surface (ADR D-013): with every network API guarded, the
 * whole tool, resource and prompt surface is exercised over the in-memory transport and no
 * attempt may be recorded. Iterates the registry, so a new tool without an argument set
 * here fails the test rather than slipping past the proof.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSample } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNetworkGuard } from '../../core/test/helpers/networkGuard.ts';
import { encodeBase64 } from '../src/base64.ts';
import { PROMPT_NAMES } from '../src/prompts/index.ts';
import { TOOLS } from '../src/registry.ts';
import { STATIC_RESOURCE_URIS } from '../src/resources/index.ts';
import { call, connect, memoryFileSystem } from './harness.ts';

const guard = createNetworkGuard();
beforeAll(() => guard.install());
afterAll(() => guard.restore());

const FIX = join(import.meta.dirname, '..', '..', 'core', 'test', 'fixtures', 'musterwerk');
const NAMES = [
  'lieferantenerklaerung.pdf',
  'stueckliste.xlsx',
  'energierechnung.pdf',
  'datasheet-en.csv',
  'handover-notes.docx',
];

describe('sovereignty: the server surface makes no network attempt', () => {
  it('the guards record and block a real attempt (self-check)', () => {
    expect(() => fetch('https://example.invalid')).toThrow(/sovereignty/);
    expect(guard.attempts.splice(0)).toEqual([{ api: 'fetch', target: 'https://example.invalid' }]);
  });

  it('every tool, resource and prompt', { timeout: 30000 }, async () => {
    const bytes = Object.fromEntries(
      NAMES.map((n) => [`/work/docs/${n}`, new Uint8Array(readFileSync(join(FIX, n)))]),
    );
    const session = await connect({ fs: memoryFileSystem(bytes) });
    try {
      const { client } = session;
      const covered = new Set<string>();
      const run = async (name: string, args: Record<string, unknown>) => {
        covered.add(name);
        const r = await call<Record<string, unknown>>(client, name, args);
        expect(r.isError, `${name}: ${r.text}`).toBe(false);
        return r.structured;
      };

      await run('list_capabilities', {});
      await run('check_obligations', {
        batteryType: 'EV',
        role: 'manufacturer',
        placedOnMarketDate: '2027-06-01',
      });
      await run('explain_attribute', { id: 'batteryChemistry' });

      const byPath = await run('ingest_documents', { paths: ['docs'], detail: 'full' });
      // A directory is read in sorted order; send inline bytes the same way for equal ids.
      const inline = await run('ingest_documents', {
        inline: [...NAMES].sort().map((n) => ({
          name: `docs/${n}`,
          base64: encodeBase64(bytes[`/work/docs/${n}`] as Uint8Array),
        })),
      });
      expect(inline['bundleId']).toBe(byPath['bundleId']);
      const facts = await run('extract_facts', { bundle: { bundleId: byPath['bundleId'] } });
      const proposals = await run('suggest_mappings', {
        facts: { factSetId: facts['factSetId'] },
        category: 'EV',
        minConfidence: 0.7,
      });
      const applied = await run('apply_mappings', {
        meta: { category: 'EV', passportId: 'urn:passwerk:sovereignty:1' },
        mappings: (proposals['proposals'] as Record<string, unknown>[]).map((p) => ({
          attributeId: p['attributeId'],
          value: p['value'],
          ...(p['unit'] !== undefined ? { unit: p['unit'] } : {}),
          ...(p['path'] !== undefined ? { path: p['path'] } : {}),
        })),
      });
      await run('validate_passport', { draft: { draftId: applied['draftId'] } });
      await run('gap_report', { draft: { draftId: applied['draftId'] } });
      await run('emit_passport', {
        draft: getSample('ev-valid'),
        targets: ['aas-json', 'aasx', 'draft-json'],
      });
      await run('emit_passport', {
        draft: getSample('lmt-valid'),
        targets: ['aas-json', 'aasx', 'draft-json'],
        outDir: 'out',
      });

      expect([...covered].sort()).toEqual(TOOLS.map((t) => t.name).sort());

      for (const uri of STATIC_RESOURCE_URIS) await client.readResource({ uri });
      await client.readResource({ uri: 'passwerk://samples/industrial-valid' });
      for (const part of [1, 2, 3, 4, 5, 6, 7]) {
        await client.readResource({ uri: `passwerk://reference/template/${part}` });
      }
      await client.readResource({ uri: `passwerk://session/draft/${String(applied['draftId'])}` });
      for (const name of PROMPT_NAMES) {
        await client.getPrompt({ name, arguments: { lang: 'de' } });
        await client.getPrompt({ name, arguments: { lang: 'en' } });
      }
    } finally {
      await session.close();
    }
    expect(guard.attempts).toEqual([]);
  });
});
