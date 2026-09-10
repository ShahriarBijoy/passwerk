import { expect, type FrameLocator, type Page } from '@playwright/test';
import { CLOCK } from '../../web/e2e/helpers.ts';

export {
  CLOCK,
  closeSheet,
  expectedMusterwerk,
  fixturePaths,
  MUSTERWERK_FILES,
  openRow,
  PASSPORT_ID,
  toExport,
} from '../../web/e2e/helpers.ts';

/** What the host page records for a test to read (see e2e/host/host.ts). */
export interface HostContext {
  content: { type: string; text: string }[];
  structuredContent: { draftId: string; verdict: string; mandatoryCompleteness: string };
}
export interface HostDownload {
  contents: { type: string; resource: { uri: string; mimeType: string; blob: string } }[];
}

/**
 * Pins the clock in every frame (init scripts run in srcdoc iframes too), opens the host page,
 * calls `review_passport` for `sample` (`none` opens an empty workbench) and returns the
 * workbench frame once it has rendered.
 */
export async function openWorkbench(page: Page, sample: string): Promise<FrameLocator> {
  await page.addInitScript((clock) => {
    (window as unknown as { __passwerkClock: string }).__passwerkClock = clock;
  }, CLOCK);
  await page.goto('/');
  await expect(page.getByTestId('host-session')).not.toBeEmpty();
  await page.locator('#host-sample').selectOption(sample);
  await page.getByTestId('host-open').click();
  await expect(page.getByTestId('host-status')).toHaveText('ready');
  const frame = page.frameLocator('[data-testid="host-frame"]');
  if (sample === 'none') {
    // The empty workbench starts on the project screen, in German (host locale de-DE). The
    // identifier section is collapsible now and collapsed by default; startProject opens it.
    await expect(frame.getByTestId('section-identifier')).toBeVisible();
  } else {
    await expect(frame.getByTestId('review-summary')).toBeVisible();
  }
  return frame;
}

export async function lastContext(page: Page): Promise<HostContext> {
  await expect(page.getByTestId('host-context')).toContainText('drf_');
  return JSON.parse((await page.getByTestId('host-context').textContent()) ?? '{}');
}

export function downloads(page: Page): Promise<HostDownload[]> {
  return page.evaluate(() => (window as unknown as { __downloads: HostDownload[] }).__downloads);
}

/**
 * The workbench's project screen for the Musterwerk documents: https identifier, EV default.
 * The identifier block is a collapsible row (`section-identifier`) that starts collapsed unless
 * the identifier is already invalid, so this opens it first (same probe as the web helper's
 * `openSection`, on the frame).
 */
export async function startProject(frame: FrameLocator, passportId: string): Promise<void> {
  await expect(frame.getByTestId('obligation-category')).toContainText('EV');
  const probe = frame.getByTestId('identifier-mode-https');
  if (!(await probe.isVisible())) await frame.getByTestId('section-identifier').click();
  await expect(probe).toBeVisible();
  await probe.click();
  await frame.getByTestId('identifier-uri').fill(passportId);
  await frame.getByTestId('project-continue').click();
  await expect(frame.getByTestId('file-input')).toBeVisible();
}
