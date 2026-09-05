/**
 * Locations of the bundled artefacts used by the generators and the tests (relative to the
 * package root). Node-only; never imported by src/.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AasEnvironment, TemplateInput } from './catalogue.ts';
import type { SammInput } from './samm.ts';

export const TEMPLATE_FILES: ReadonlyArray<{ part: number; version: string; file: string }> = [
  { part: 1, version: '1.0', file: 'artefacts/idta/02035-1/1.0/template.json' },
  { part: 2, version: '1.0', file: 'artefacts/idta/02035-2/1.0/template.json' },
  { part: 3, version: '1.0', file: 'artefacts/idta/02035-3/1.0/template.json' },
  { part: 4, version: '1.0.1', file: 'artefacts/idta/02035-4/1.0.1/template.json' },
  { part: 5, version: '1.0.2', file: 'artefacts/idta/02035-5/1.0.2/template.json' },
  { part: 6, version: '1.0.1', file: 'artefacts/idta/02035-6/1.0.1/template.json' },
  { part: 7, version: '1.0.1', file: 'artefacts/idta/02035-7/1.0.1/template.json' },
];

export const LONGLIST_FILE =
  'artefacts/batterypass/2025_Battery_Passport_Data_Attributes_V1.2.xlsx';

/** Battery Pass Data Model aspect models (SAMM Turtle), the newest version of each at the pinned commit. */
export const SAMM_FILES: ReadonlyArray<{ key: string; version: string; file: string }> = [
  {
    key: 'CarbonFootprint',
    version: '1.2.0',
    file: 'artefacts/batterypass/samm/CarbonFootprint-1.2.0.ttl',
  },
  {
    key: 'Circularity',
    version: '1.2.0',
    file: 'artefacts/batterypass/samm/Circularity-1.2.0.ttl',
  },
  {
    key: 'GeneralProductInformation',
    version: '1.2.0',
    file: 'artefacts/batterypass/samm/GeneralProductInformation-1.2.0.ttl',
  },
  { key: 'Labels', version: '1.2.0', file: 'artefacts/batterypass/samm/Labels-1.2.0.ttl' },
  {
    key: 'MaterialComposition',
    version: '1.2.0',
    file: 'artefacts/batterypass/samm/MaterialComposition-1.2.0.ttl',
  },
  {
    key: 'Performance',
    version: '1.2.1',
    file: 'artefacts/batterypass/samm/Performance-1.2.1.ttl',
  },
  {
    key: 'SupplyChainDueDiligence',
    version: '1.2.0',
    file: 'artefacts/batterypass/samm/SupplyChainDueDiligence-1.2.0.ttl',
  },
];

export async function loadSammInputs(packageRoot: string): Promise<SammInput[]> {
  return Promise.all(
    SAMM_FILES.map(async ({ key, version, file }) => ({
      key,
      version,
      file,
      turtle: await readFile(resolve(packageRoot, file), 'utf8'),
    })),
  );
}

export async function loadTemplateInputs(packageRoot: string): Promise<TemplateInput[]> {
  return Promise.all(
    TEMPLATE_FILES.map(async ({ part, version, file }) => ({
      part,
      version,
      environment: JSON.parse(await readFile(resolve(packageRoot, file), 'utf8')) as AasEnvironment,
    })),
  );
}
