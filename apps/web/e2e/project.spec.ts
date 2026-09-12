import { buildGs1DigitalLink, checkObligations } from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { CLOCK, openSection, pinClock } from './helpers.ts';

test('industrial battery: threshold, voluntary category, timeline as core', async ({ page }) => {
  await pinClock(page);
  await page.goto('/');
  await page.getByTestId('battery-type').click();
  await page.getByRole('option', { name: /^Industriebatterie$/ }).click();
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute(
    'data-verdict',
    'insufficient_input',
  );
  await page.getByTestId('energy-kwh').fill('1,5');
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute(
    'data-verdict',
    'not_required',
  );
  await expect(page.getByTestId('manual-category')).toBeVisible();
  await expect(page.getByTestId('project-continue')).toBeDisabled();
  await page.getByTestId('manual-category').click();
  await page.getByRole('option', { name: /2 kWh/ }).click();
  await expect(page.getByTestId('project-continue')).toBeEnabled();
  await page.getByTestId('energy-kwh').fill('3');
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute(
    'data-verdict',
    'not_required',
  ); // before 2027-02-18
  await expect(page.getByTestId('obligation-category')).toContainText('2 kWh');
  await page.getByTestId('placed-on-market').fill('2027-03-01');
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute('data-verdict', 'required');
  const expected = checkObligations({
    batteryType: 'INDUSTRIAL',
    role: 'manufacturer',
    energyKwh: '3',
    placedOnMarketDate: '2027-03-01',
    asOf: CLOCK,
  });
  const ids = await page
    .getByTestId('timeline-entry')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  expect(ids).toEqual(expected.timeline.map((e) => e.id));
});

test('portable battery: no derived category, select appears', async ({ page }) => {
  await pinClock(page);
  await page.goto('/');
  await page.getByTestId('battery-type').click();
  await page.getByRole('option', { name: /Gerätebatterie/ }).click();
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute(
    'data-verdict',
    'not_required',
  );
  // EV is also not_required at the pinned clock (before 2027-02-18), so the verdict alone
  // cannot tell the two apart. Portable's reason is core's "uncovered battery type" text
  // (checkObligations, packages/core/src/obligations/check.ts), distinct from EV's
  // "obligation starts on ... this is before that date" reason.
  await expect(page.getByTestId('obligation-reason')).toContainText('gehört nicht dazu');
  await expect(page.getByTestId('manual-category')).toBeVisible();
});

test('GS1 identifier: QR preview payload equals core, wrong check digit blocks', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('/');
  await openSection(page, 'identifier');
  await page.getByTestId('identifier-mode-gs1').click();
  await page.getByTestId('identifier-resolver').fill('https://id.example.com');
  await page.getByTestId('identifier-gtin').fill('96385075');
  await page.getByTestId('identifier-serial').fill('SN-1');
  await expect(page.getByTestId('identifier-error')).toContainText('Prüfziffer');
  await expect(page.getByTestId('project-continue')).toBeDisabled();
  await page.getByTestId('identifier-gtin').fill('96385074');
  await expect(page.getByTestId('qr-image')).toBeVisible();
  await expect(page.getByTestId('qr-payload')).toHaveText(
    buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'SN-1' }),
  );
  await expect(page.getByTestId('project-continue')).toBeEnabled();
});
