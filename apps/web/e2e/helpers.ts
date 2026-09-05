import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BatteryCategory } from '@passwerk/core';
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
import type { Page } from '@playwright/test';

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

export async function startProject(
  page: Page,
  opts: { category: BatteryCategory; passportId: string },
): Promise<void> {
  await page.goto('/');
  if (opts.category !== 'EV') {
    await page.getByTestId('category').click();
    await page
      .getByRole('option', { name: new RegExp(opts.category === 'LMT' ? 'LMT' : '2 kWh') })
      .click();
  }
  await page.getByTestId('passport-id').fill(opts.passportId);
  await page.getByTestId('start').click();
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
  return { bundle, proposals, decisions, report, gap };
}
