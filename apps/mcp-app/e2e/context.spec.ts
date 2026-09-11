import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { getSample, validateSchema } from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { SERVER_URL, TOKEN } from '../playwright.config.ts';
import { lastContext, openWorkbench, toExport } from './helpers.ts';

/**
 * The model-context track: after a decision in the workbench, the draft id the workbench pushed
 * through updateModelContext resolves, in the same MCP session, to the draft the screen shows.
 * A second client attaches to the browser's session id, as the host's model would.
 */
test('the model learns the draft id the workbench synced, in the same session', async ({
  page,
}) => {
  const frame = await openWorkbench(page, 'ev-valid');
  const first = await lastContext(page);
  expect(first.structuredContent.verdict).toBe('valid');

  // Change the draft: a manual nominal voltage the sample does not have.
  await frame.getByTestId('add-value').click();
  await frame.getByTestId('add-attribute').click();
  await frame.getByRole('option', { name: /nominalVoltage/ }).click();
  await frame.getByTestId('add-value-input').fill('401');
  await frame.getByTestId('add-unit-input').fill('V');
  await frame.getByTestId('add-submit').click();
  await expect
    .poll(async () => (await lastContext(page)).structuredContent.draftId, { timeout: 20_000 })
    .not.toBe(first.structuredContent.draftId);
  const second = await lastContext(page);

  const sessionId = (await page.getByTestId('host-session').textContent()) ?? '';
  expect(sessionId).not.toBe('');
  const client = new Client({ name: 'passwerk-e2e-model', version: '0' });
  // The SDK's client transport type and exactOptionalPropertyTypes disagree on sessionId.
  const transport = new StreamableHTTPClientTransport(new URL(`${SERVER_URL}/mcp`), {
    sessionId,
    requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
  }) as unknown as Transport;
  await client.connect(transport);
  try {
    const gap = await client.callTool({
      name: 'gap_report',
      arguments: { draft: { draftId: second.structuredContent.draftId } },
    });
    const structured = gap.structuredContent as {
      draftId: string;
      completeness: { mandatory: { percent: string } };
      items: { attributeId: string; status: string }[];
    };
    expect(structured.draftId).toBe(second.structuredContent.draftId);
    expect(structured.completeness.mandatory.percent).toBe(
      second.structuredContent.mandatoryCompleteness,
    );
    // The stored draft carries the workbench's change, not the sample's value.
    const stored = await client.readResource({
      uri: `passwerk://session/draft/${second.structuredContent.draftId}`,
    });
    const draft = validateSchema(JSON.parse((stored.contents[0] as { text: string }).text)).draft;
    expect(draft?.attributes['nominalVoltage']?.value).toBe('401');
    const sample = validateSchema(getSample('ev-valid')).draft;
    expect(sample?.attributes['nominalVoltage']?.value).not.toBe('401');
  } finally {
    await client.close();
  }
});

/**
 * Fullscreen: `display-toggle` only renders once the host context lists `fullscreen` in
 * `availableDisplayModes` (App.tsx's `canFullscreen`), which the dev host does (e2e/host/host.ts).
 * Clicking it calls the host's `requestDisplayMode`, whose `AppBridge.onrequestdisplaymode`
 * handler records the request and - per the SDK check below - also pushes a
 * `ui/notifications/host-context-changed` notification back to the app.
 *
 * SDK check: `@modelcontextprotocol/ext-apps` 1.7.5's `AppBridge` (see
 * `node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.d.ts`) exposes
 * `sendHostContextChange(params: McpUiHostContextChangedNotification['params']): Promise<void> |
 * void` (no trailing `d`), so the host page can deliver the mode change back to the app; the
 * fallback the task brief allows (dropping the height assertion because the bridge cannot push a
 * context change) does not apply here.
 *
 * `main.tsx` reacts to that notification (`host.onhostcontextchanged`) by setting
 * `--instrument-height` to `100vh`. The instrument iframe itself stays a fixed 640px in this dev
 * host (only a real host resizes the surrounding chrome to match a fullscreen request), so the
 * frame's own reported body height does not change; the CSS variable is what actually flips, and
 * that is what this test asserts.
 */
test('fullscreen is offered by the host and requested by the workbench', async ({ page }) => {
  const frame = await openWorkbench(page, 'ev-valid');
  await frame.getByTestId('display-toggle').click();

  // The host received the request.
  await expect(page.getByTestId('host-display')).toContainText('fullscreen');
  const requests = await page.evaluate(
    () => (window as unknown as { __displayRequests: { mode: string }[] }).__displayRequests,
  );
  expect(requests.map((r) => r.mode)).toContain('fullscreen');

  // The workbench applied the host's context change.
  await expect
    .poll(async () =>
      page
        .frameLocator('[data-testid="host-frame"]')
        .locator('html')
        .evaluate((el) => el.style.getPropertyValue('--instrument-height')),
    )
    .toBe('100vh');
});

/**
 * Fix-wave item 1: the "cannot download" notice now renders inside the instrument's footer
 * (`Instrument`'s `notice` slot), not a band above the frame, so it can never grow the document
 * the host resizes to. `?nodownload` opens the dev host without the `downloadFile` capability
 * (`e2e/host/host.ts`), the same shape a host that offers no downloads at all would present.
 */
test('a host without downloadFile shows its notice inside the frame, height unchanged', async ({
  page,
}) => {
  const frame = await openWorkbench(page, 'ev-valid', { nodownload: true });
  await toExport(frame);
  await frame.getByTestId('export-aasJson').click();
  await expect(frame.getByTestId('host-notice')).toBeVisible();

  const sizes = await page.evaluate(
    () => (window as unknown as { __sizes: { height?: number }[] }).__sizes,
  );
  expect(sizes.length).toBeGreaterThan(0);
  expect(new Set(sizes.map((s) => s.height))).toEqual(new Set([640]));
});
