import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { describe, expect, it } from 'vitest';
import { MCP_APP_MIME, WORKBENCH_NOT_BUILT, WORKBENCH_UI_META, WORKBENCH_URI } from '../src/ui.ts';
import { connect } from './harness.ts';

const HTML = '<!doctype html><html><body>probe</body></html>';

describe('ui://passwerk/workbench.html (Phase 7b, ADR D-037)', () => {
  it('uses the literals the MCP Apps SDK defines, without depending on it', () => {
    // The server package writes the mime type and the _meta.ui shape itself so it does not
    // carry the SDK (and its React peer) into the published tarball; this monorepo test is
    // the parity check.
    expect(MCP_APP_MIME).toBe(RESOURCE_MIME_TYPE);
    expect(Object.keys(WORKBENCH_UI_META).sort()).toEqual(['csp', 'prefersBorder']);
    expect(Object.keys(WORKBENCH_UI_META.csp).sort()).toEqual([
      'connectDomains',
      'resourceDomains',
    ]);
  });

  it('is listed and served with an empty CSP and a border preference', async () => {
    const s = await connect({ ui: { html: async () => HTML } });
    try {
      const { resources } = await s.client.listResources();
      const r = resources.find((x) => x.uri === WORKBENCH_URI);
      expect(r?.mimeType).toBe(MCP_APP_MIME);
      expect(r?.name).toBe('workbench');
      const read = await s.client.readResource({ uri: WORKBENCH_URI });
      const c = read.contents[0] as { uri: string; mimeType: string; text: string; _meta: unknown };
      expect(c.uri).toBe(WORKBENCH_URI);
      expect(c.mimeType).toBe(MCP_APP_MIME);
      expect(c.text).toBe(HTML);
      expect(c._meta).toEqual({
        ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true },
      });
    } finally {
      await s.close();
    }
  });

  it('is fail-honest when the server has no workbench loader', async () => {
    const s = await connect();
    try {
      await expect(s.client.readResource({ uri: WORKBENCH_URI })).rejects.toThrow(
        WORKBENCH_NOT_BUILT,
      );
    } finally {
      await s.close();
    }
  });

  it('reports a loader failure as the not-built message, never the raw error', async () => {
    const s = await connect({
      ui: {
        html: async () => {
          throw new Error('ENOENT: no such file');
        },
      },
    });
    try {
      const failure = s.client.readResource({ uri: WORKBENCH_URI });
      await expect(failure).rejects.toThrow(WORKBENCH_NOT_BUILT);
      await expect(failure).rejects.not.toThrow('ENOENT');
    } finally {
      await s.close();
    }
  });
});
