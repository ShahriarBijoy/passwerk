import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyMappings,
  extractFacts,
  gapReport,
  ingest,
  newDraft,
  SCHEMA_VERSION,
  suggestMappings,
  validate,
} from '@passwerk/core';
import { expect, type Page } from '@playwright/test';

export const CLOCK = '2026-09-05T12:00:00.000Z';
export const FIXTURES = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'core',
  'test',
  'fixtures',
  'musterwerk',
);
export const MUSTERWERK_FILES = [
  'lieferantenerklaerung.pdf',
  'stueckliste.xlsx',
  'energierechnung.pdf',
  'datasheet-en.csv',
  'handover-notes.docx',
];
export const PASSPORT_ID = 'https://passport.musterwerk.example/battery/MW-EV-2026-000123';

export async function pinClock(page: Page): Promise<void> {
  await page.addInitScript((clock) => {
    (window as unknown as { __passwerkClock: string }).__passwerkClock = clock;
  }, CLOCK);
}

export interface StartOptions {
  identifier:
    | { mode: 'https'; uri: string }
    | { mode: 'gs1'; resolverBase: string; gtin: string; serial: string };
}

/**
 * Fill the project screen and continue to the upload step. The default battery type is EV, so
 * every caller gets the EV category assertion; a spec that needs a different battery type or
 * energy value drives the `battery-type` / `energy-kwh` selects directly (see project.spec.ts).
 */
export async function startProject(page: Page, opts: StartOptions): Promise<void> {
  await page.goto('/');
  // The pinned CLOCK is before 2027-02-18, so the derived category is always shown (verdict
  // not_required) for the default EV battery type.
  await expect(page.getByTestId('obligation-category')).toContainText('EV');
  await page.getByTestId(`identifier-mode-${opts.identifier.mode}`).click();
  if (opts.identifier.mode === 'https') {
    await page.getByTestId('identifier-uri').fill(opts.identifier.uri);
  } else {
    await page.getByTestId('identifier-resolver').fill(opts.identifier.resolverBase);
    await page.getByTestId('identifier-gtin').fill(opts.identifier.gtin);
    await page.getByTestId('identifier-serial').fill(opts.identifier.serial);
  }
  await page.getByTestId('project-continue').click();
  await expect(page.getByTestId('file-input')).toBeVisible();
}

export function fixturePaths(): string[] {
  return MUSTERWERK_FILES.map((f) => join(FIXTURES, f));
}

/** What core computes in Node for the same documents, decisions and clock. */
export async function expectedMusterwerk() {
  const bundle = await ingest(
    MUSTERWERK_FILES.map((name) => ({
      name,
      bytes: new Uint8Array(readFileSync(join(FIXTURES, name))),
    })),
  );
  const facts = extractFacts(bundle);
  const proposals = suggestMappings(facts, { category: 'EV' });
  const accepted = proposals.filter((p) => p.confidence >= 0.7);
  // One decision per attribute+path: the first accepted proposal in each group, mirroring the UI.
  const seen = new Set<string>();
  const decisions = accepted.filter((p) => {
    const key = p.path === undefined ? p.attributeId : `${p.attributeId}#${p.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const draft = newDraft({
    schemaVersion: SCHEMA_VERSION,
    category: 'EV',
    createdAt: CLOCK,
    passportId: PASSPORT_ID,
  });
  const applied = applyMappings(
    draft,
    decisions.map((p) => ({
      attributeId: p.attributeId,
      ...(p.path !== undefined ? { path: p.path } : {}),
      value: p.value,
      ...(p.unit ? { unit: p.unit } : {}),
      source: p.source,
      confidence: p.confidence,
      override: true,
    })),
  );
  const report = validate(applied.draft, { asOf: CLOCK });
  const gap = gapReport(applied.draft, { report, asOf: CLOCK });
  return { bundle, facts, proposals, decisions, report, gap };
}
