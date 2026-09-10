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
import { expect, type FrameLocator, type Page } from '@playwright/test';

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
 * Opens the collapsible `section-<id>` row on the project screen if its content is not already
 * visible. The identifier section opens itself when the identifier is invalid, so this is a
 * no-op in that case.
 */
export async function openSection(page: Page, id: 'identifier' | 'import'): Promise<void> {
  const probe =
    id === 'identifier'
      ? page.getByTestId('identifier-mode-https')
      : page.getByTestId('import-draft');
  if (!(await probe.isVisible())) await page.getByTestId(`section-${id}`).click();
  await expect(probe).toBeVisible();
}

/**
 * Closes an open sheet via its own `sheet-close` button (Sheet.tsx), if one is open. The sheet
 * is a genuine bottom sheet (spec §3.2): non-modal in the sense that the toolbar and scrolling
 * stay live, but it still covers the bottom ~45% of the instrument (including the footer), so a
 * row or button rendered under it is exactly as unclickable for a real reviewer as for
 * Playwright. The click, not `Escape`, is deliberate: once a nested dialog (the row editor, the
 * add-value dialog) has opened and closed over a sheet, Radix leaves its own dismiss layer
 * registered, so `Escape` stops reaching the sheet even though the sheet is still visibly open
 * and its own close button still works. Idempotent: a no-op when nothing is open.
 */
export async function closeSheet(scope: Page | FrameLocator): Promise<void> {
  const openSheet = scope.locator('[data-testid$="-sheet"]');
  if (await openSheet.count()) {
    await scope.getByTestId('sheet-close').click();
    await expect(openSheet).toHaveCount(0);
  }
}

/**
 * Clicks a row and waits for the sheet it opens (a `data-testid` ending in `-sheet`) to appear.
 * Closes any sheet already open first (see `closeSheet`), so the next row is never asked to
 * receive a click through an overlay sitting on top of it.
 */
export async function openRow(scope: Page | FrameLocator, selector: string): Promise<void> {
  await closeSheet(scope);
  await scope.locator(selector).click();
  await expect(scope.locator('[data-testid$="-sheet"]')).toBeVisible();
}

/**
 * From the review screen: continue to gaps, wait for the verdict, then continue to export. Closes
 * a sheet left open from a previous decision first (see `closeSheet`): it covers the footer.
 */
export async function toExport(scope: Page | FrameLocator): Promise<void> {
  await closeSheet(scope);
  await scope.getByTestId('to-gaps').click();
  await expect(scope.getByTestId('verdict')).toBeVisible();
  await scope.getByTestId('to-export').click();
  await expect(scope.getByTestId('export-aasx')).toBeVisible();
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
  await openSection(page, 'identifier');
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
