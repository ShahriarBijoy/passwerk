/**
 * kb/generated/*.json must be exactly what the generators produce from the bundled artefacts.
 * A stale or hand-edited generated file fails here; run `pnpm --filter @passwerk/rules generate`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifestJson from '../artefacts/manifest.json' with { type: 'json' };
import committedSammJson from '../kb/generated/batterypass-samm.json' with { type: 'json' };
import committedLonglistJson from '../kb/generated/din-longlist.json' with { type: 'json' };
import committedCatalogueJson from '../kb/generated/template-catalogue.json' with { type: 'json' };
import { buildCatalogue, type TemplateCatalogue } from '../scripts/lib/catalogue.ts';
import { extractLonglist, type Longlist } from '../scripts/lib/longlist.ts';
import { renderProvenance } from '../scripts/lib/provenance.ts';
import { extractSammModel, type SammModel } from '../scripts/lib/samm.ts';
import { LONGLIST_FILE, loadSammInputs, loadTemplateInputs } from '../scripts/lib/sources.ts';
import type { ArtefactManifest } from '../src/types.ts';

const pkg = resolve(import.meta.dirname, '..');
const committedCatalogue = committedCatalogueJson as unknown as TemplateCatalogue;
const committedLonglist = committedLonglistJson as unknown as Longlist;
const committedSamm = committedSammJson as unknown as SammModel;

describe('kb/generated', () => {
  it('template-catalogue.json is up to date and covers 7 templates / 211 elements', async () => {
    const fresh = buildCatalogue(await loadTemplateInputs(pkg));
    expect(fresh.templates).toHaveLength(7);
    expect(fresh.templates.reduce((n, t) => n + t.elementCount, 0)).toBe(211);
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(committedCatalogue);
  });

  it('every catalogue element has a semanticId and a known cardinality, except the documented gaps', async () => {
    const elements = committedCatalogue.templates.flatMap((t) => t.elements);
    const noSemanticId = elements.filter((e) => e.semanticId === null).map((e) => e.path);
    expect(noSemanticId).toEqual([]);
    const noCardinality = elements.filter((e) => e.cardinality.raw === null).map((e) => e.path);
    // Two official template elements carry no cardinality qualifier; recorded so a template
    // update that fixes or worsens this is noticed.
    expect(noCardinality).toEqual([
      '3/ProductCarbonFootprints/ProductCarbonFootprint',
      '4/GeneralInformation/WarrantyInformation',
    ]);
  });

  it('every element joined a ConceptDescription where the template ships one', () => {
    const joins = committedCatalogue.templates.map((t) => ({
      part: t.part,
      exact: t.elements.filter((e) => e.conceptJoin === 'exact').length,
      versionless: t.elements.filter((e) => e.conceptJoin === 'versionless').length,
    }));
    // Part 6 v1.0.1 references 1.0.1 semanticIds but ships 1.0.0 ConceptDescriptions.
    expect(joins.find((j) => j.part === 6)).toEqual({ part: 6, exact: 0, versionless: 23 });
    for (const j of joins.filter((j) => j.part !== 6))
      expect(j.versionless, `part ${j.part}`).toBe(0);
  });

  it('din-longlist.json is up to date and has the 93 DIN DKE SPEC 99100 attributes', () => {
    const fresh = extractLonglist(new Uint8Array(readFileSync(resolve(pkg, LONGLIST_FILE))));
    expect(fresh.rows).toHaveLength(93);
    expect(fresh.rows.map((r) => r.no)).toEqual(Array.from({ length: 93 }, (_, i) => i + 1));
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(committedLonglist);
  });

  it('batterypass-samm.json is up to date and covers the 7 Battery Pass aspect models', async () => {
    const fresh = extractSammModel(await loadSammInputs(pkg));
    expect(fresh.sections.map((s) => `${s.key}@${s.version}`)).toEqual([
      'CarbonFootprint@1.2.0',
      'Circularity@1.2.0',
      'GeneralProductInformation@1.2.0',
      'Labels@1.2.0',
      'MaterialComposition@1.2.0',
      'Performance@1.2.1',
      'SupplyChainDueDiligence@1.2.0',
    ]);
    expect(fresh.sections.reduce((n, s) => n + s.propertyCount, 0)).toBe(144);
    for (const s of fresh.sections) {
      expect(s.namespace, s.key).toBe(`urn:samm:io.BatteryPass.${s.key}:${s.version}#`);
      for (const p of s.properties) expect(p.paths.length, `${s.key}#${p.name}`).toBeGreaterThan(0);
    }
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(committedSamm);
  });

  it('PROVENANCE.md is rendered from the manifest', () => {
    const committed = readFileSync(resolve(pkg, 'PROVENANCE.md'), 'utf8');
    expect(committed).toBe(renderProvenance(manifestJson as unknown as ArtefactManifest));
  });
});
