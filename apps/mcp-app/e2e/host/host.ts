/**
 * Dev-only MCP Apps host for the Playwright suite (spec section 5.3), after the SDK's
 * `basic-host`: an MCP client over Streamable HTTP to the passwerk server (same origin, the
 * preview proxies /mcp), `review_passport`, the `ui://` resource into a sandboxed iframe, and
 * an `AppBridge` over postMessage. Every `updateModelContext` and `downloadFile` the workbench
 * sends is rendered into the page so a test can read it.
 *
 * The HTML goes into `srcdoc` instead of the SDK's double-iframe sandbox proxy: the proxy needs
 * a second origin, which the sovereignty track forbids. The iframe keeps the same three sandbox
 * tokens Claude's host uses.
 */
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const TOKEN = 'e2e-token';
const WORKBENCH_URI = 'ui://passwerk/workbench.html';

const byTestId = (id: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  return el;
};

declare global {
  interface Window {
    __downloads: unknown[];
    __contexts: unknown[];
  }
}
window.__downloads = [];
window.__contexts = [];

const transport = new StreamableHTTPClientTransport(new URL('/mcp', location.href), {
  requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
});
const client = new Client({ name: 'passwerk-e2e-host', version: '0' });
// The SDK's client transport type and exactOptionalPropertyTypes disagree on `sessionId`.
await client.connect(transport as unknown as Transport);
byTestId('host-session').textContent = transport.sessionId ?? '';

// Sample names come from the server so the host page bundles no domain code.
const select = document.getElementById('host-sample') as HTMLSelectElement;
const index = await client.readResource({ uri: 'passwerk://samples' });
const names = JSON.parse((index.contents[0] as { text: string }).text) as {
  valid: { name: string }[];
  broken: { name: string }[];
};
for (const { name } of [...names.valid, ...names.broken]) {
  const o = document.createElement('option');
  o.value = name;
  o.textContent = name;
  select.append(o);
}

byTestId('host-open').onclick = async () => {
  const status = byTestId('host-status');
  status.textContent = 'opening';
  const sample = select.value;
  let args: Record<string, unknown> = {};
  if (sample !== 'none') {
    const r = await client.readResource({ uri: `passwerk://samples/${sample}` });
    args = { draft: JSON.parse((r.contents[0] as { text: string }).text) };
  }
  const result = await client.callTool({ name: 'review_passport', arguments: args });

  const res = await client.readResource({ uri: WORKBENCH_URI });
  const content = res.contents[0] as { text: string; mimeType: string };
  if (content.mimeType !== 'text/html;profile=mcp-app') {
    status.textContent = `unexpected mime ${content.mimeType}`;
    return;
  }
  const iframe = byTestId('host-frame') as HTMLIFrameElement;
  const loaded = new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
  });
  iframe.srcdoc = content.text;
  await loaded;
  const view = iframe.contentWindow;
  if (!view) throw new Error('iframe has no window');

  const bridge = new AppBridge(
    client,
    { name: 'passwerk-e2e-host', version: '0' },
    {
      serverTools: {},
      serverResources: {},
      updateModelContext: { text: {} },
      downloadFile: {},
    },
    {
      hostContext: {
        theme: 'light',
        locale: 'de-DE',
        platform: 'web',
        displayMode: 'inline',
        containerDimensions: { width: iframe.clientWidth, height: 1800 },
      },
    },
  );
  bridge.onupdatemodelcontext = async (p) => {
    window.__contexts.push(p);
    byTestId('host-context').textContent = JSON.stringify(p);
    return {};
  };
  bridge.ondownloadfile = async (p) => {
    window.__downloads.push(p);
    byTestId('host-downloads').textContent = JSON.stringify(
      (p.contents as { resource?: { uri?: string; mimeType?: string } }[]).map((c) => ({
        uri: c.resource?.uri,
        mimeType: c.resource?.mimeType,
      })),
    );
    return {};
  };
  bridge.onsizechange = () => {};
  bridge.oninitialized = () => {
    bridge.sendToolInput({ arguments: args });
    void bridge.sendToolResult(result as Parameters<typeof bridge.sendToolResult>[0]);
    status.textContent = 'ready';
  };
  await bridge.connect(new PostMessageTransport(view, view));
};
