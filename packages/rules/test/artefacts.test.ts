/**
 * Every bundled artefact must match the sha256 pinned in artefacts/manifest.json, offline.
 * This is the "templates are pinned and checksummed" guarantee from docs/BUILD_PLAN.md Phase 1.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../artefacts/manifest.json' with { type: 'json' };

const artefactsDir = resolve(import.meta.dirname, '../artefacts');
const bundled = manifest.artefacts.filter((a) => a.path !== null);

describe('artefacts/manifest.json', () => {
  it('pins the seven IDTA 02035 templates (JSON + AASX), two AAS schemas, the EC guidance, the longlist and the seven SAMM models', () => {
    const ids = new Set(manifest.artefacts.map((a) => a.id));
    for (let part = 1; part <= 7; part += 1) {
      expect(ids.has(`idta-02035-${part}/template.json`)).toBe(true);
      expect(ids.has(`idta-02035-${part}/template.aasx`)).toBe(true);
    }
    expect(ids.has('aas-json-schema/3.0.9')).toBe(true);
    expect(ids.has('aas-json-schema/3.1.2')).toBe(true);
    expect(ids.has('ec/data-points-by-category')).toBe(true);
    expect(ids.has('batterypass/data-attribute-longlist')).toBe(true);
    for (const section of [
      'CarbonFootprint',
      'Circularity',
      'GeneralProductInformation',
      'Labels',
      'MaterialComposition',
      'Performance',
      'SupplyChainDueDiligence',
    ]) {
      expect(ids.has(`batterypass/samm/${section}`)).toBe(true);
    }
    expect(bundled.length).toBe(31);
  });

  it('every entry has an immutable source URL, a sha256 and a licence-bearing source', () => {
    for (const a of manifest.artefacts) {
      expect(a.sha256, a.id).toMatch(/^[0-9a-f]{64}$/);
      expect(a.bytes, a.id).toBeGreaterThan(0);
      expect(a.url, a.id).toMatch(/^https:\/\//);
      const source = (manifest.sources as Record<string, { license: string }>)[a.source];
      expect(source?.license, `${a.id}: source ${a.source}`).toBeTruthy();
    }
    // GitHub raw URLs must be pinned to a commit or tag, never to a branch name.
    for (const a of manifest.artefacts.filter((x) => x.url.includes('raw.githubusercontent.com'))) {
      expect(a.url, `${a.id} must not point at a branch`).not.toMatch(
        /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/(main|master)\//,
      );
    }
  });

  it.each(bundled.map((a) => [a.id, a] as const))('%s matches its pinned sha256', (_id, a) => {
    const file = resolve(artefactsDir, a.path as string);
    expect(existsSync(file), `${a.path} is bundled`).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.byteLength).toBe(a.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha256);
  });
});
