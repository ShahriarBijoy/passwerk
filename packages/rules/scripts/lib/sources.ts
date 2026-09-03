/**
 * Locations of the bundled artefacts used by the generators and the tests (relative to the
 * package root). Node-only; never imported by src/.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AasEnvironment, TemplateInput } from './catalogue.ts';

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

export async function loadTemplateInputs(packageRoot: string): Promise<TemplateInput[]> {
  return Promise.all(
    TEMPLATE_FILES.map(async ({ part, version, file }) => ({
      part,
      version,
      environment: JSON.parse(await readFile(resolve(packageRoot, file), 'utf8')) as AasEnvironment,
    })),
  );
}
