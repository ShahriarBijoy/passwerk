import { expect, type Page, type Route, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

/**
 * A stand-in for an OpenAI-compatible endpoint (the shape Ollama and LM Studio speak). The
 * assist is never exercised against a real provider in CI: what is under test is this app's
 * request, its guards and its acceptance path, none of which need a model.
 */
const STUB_BASE = 'http://127.0.0.1:9931/v1';
const STUB_URL = `${STUB_BASE}/chat/completions`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Serve `answer` as the model's reply, and record the body the app actually sent. */
async function stubModel(page: Page, answer: unknown): Promise<{ sent: string[] }> {
  const sent: string[] = [];
  await page.route(STUB_URL, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    sent.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }),
    });
  });
  return { sent };
}

/** Upload the Musterwerk documents and stop on the review screen, deciding nothing. */
async function reachReview(page: Page): Promise<void> {
  await pinClock(page);
  await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });
  await page.getByTestId('file-input').setInputFiles(fixturePaths());
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();
  await page.getByTestId('facts-continue').click();
  await expect(page.getByTestId('assist')).toBeVisible();
}

/** Point the panel at the stub: a local runner needs no key. */
async function configureStub(page: Page): Promise<void> {
  await page.getByTestId('assist-toggle').click();
  await page.getByTestId('assist-provider').click();
  // The chrome starts in German ("OpenAI-kompatibel"), so match the part both labels share.
  await page.getByRole('option', { name: /^OpenAI/ }).click();
  await page.getByTestId('assist-base-url').fill(STUB_BASE);
  await page.getByTestId('assist-model').fill('stub-model');
}

test('a suggestion is reviewed and accepted, and reaches the draft with the fact’s provenance', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
  const foreign: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).origin !== origin) foreign.push(req.url());
  });

  const stub = await stubModel(page, {
    suggestions: [
      {
        fact: 'f0',
        attribute: 'manufacturerInformation',
        path: 'name.de',
        reason: 'Der Betreff nennt den Hersteller.',
      },
    ],
    critiques: [{ proposal: 'p0', reason: 'Sieht eher nach der Ladespannung aus.' }],
  });

  await reachReview(page);
  await configureStub(page);
  await page.getByTestId('assist-run').click();

  const suggestion = page.getByTestId('assist-suggestion');
  await expect(suggestion).toHaveCount(1);
  await expect(suggestion).toContainText('manufacturerInformation');
  await expect(suggestion).toContainText('Der Betreff nennt den Hersteller.');

  // Accepting opens the ordinary add-value dialog with the attribute already chosen.
  await page.getByTestId('assist-accept').click();
  await expect(page.getByTestId('add-attribute')).toContainText('manufacturerInformation');
  await page.getByTestId('add-submit').click();

  await expect(page.getByTestId('manual').first()).toContainText('manufacturerInformation');
  // The suggestion is spent: the draft holds it now.
  await expect(page.getByTestId('assist-suggestion')).toHaveCount(0);

  // The second opinion marks a row and nothing more.
  await page.getByTestId('filter-all').click();
  const chip = page.getByTestId('assist-critique-chip').first();
  await expect(chip).toContainText('Ladespannung');
  await expect(page.getByTestId('proposal').first()).toHaveAttribute('data-state', 'pending');

  // Sovereignty: the run reached the configured endpoint and nothing else.
  expect(foreign.filter((u) => u !== STUB_URL)).toEqual([]);
  expect(foreign).toContain(STUB_URL);

  // What was actually sent carries no document, file name, page or cell.
  const body = stub.sent.join('\n');
  expect(body.length).toBeGreaterThan(0);
  for (const mark of ['lieferantenerklaerung', 'stueckliste', 'energierechnung', '.pdf', '.xlsx']) {
    expect(body).not.toContain(mark);
  }
});

test('an invented attribute is shown as a discard and never becomes a value', async ({ page }) => {
  await stubModel(page, {
    suggestions: [
      { fact: 'f0', attribute: 'nominalVoltageDeluxe', reason: 'Klingt passend.' },
      { fact: 'f0', attribute: 'batteryMass', reason: 'Auch das noch.' },
    ],
  });

  await reachReview(page);
  await configureStub(page);
  await page.getByTestId('assist-run').click();

  // The invented one is reported as refused, and the one core can carry survives beside it:
  // a bad row loses only itself.
  await expect(page.getByTestId('assist-discard').first()).toContainText('nominalVoltageDeluxe');
  await expect(page.getByTestId('assist-suggestion')).toHaveCount(1);
  await expect(page.getByTestId('assist-suggestion')).toContainText('batteryMass');
  await expect(
    page.getByTestId('assist-suggestion').filter({ hasText: 'nominalVoltageDeluxe' }),
  ).toHaveCount(0);
  // Nothing the model said reached the draft: the reviewer has accepted nothing.
  await expect(page.getByTestId('manual')).toHaveCount(0);
});

test('the assist stays silent until it is configured and run', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
  const foreign: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).origin !== origin) foreign.push(req.url());
  });

  await reachReview(page);
  await page.getByTestId('assist-toggle').click();
  // Anthropic is the default provider and there is no key, so the button cannot be pressed.
  await expect(page.getByTestId('assist-run')).toBeDisabled();
  await expect(page.getByTestId('assist-disclosure')).toBeVisible();
  expect(foreign).toEqual([]);
});
