/**
 * The passwerk workbench as an MCP App (extension `io.modelcontextprotocol/ui`, ADR D-037).
 *
 * The server writes the two literals the MCP Apps specification defines (the resource mime
 * type and the `_meta.ui` shape) instead of depending on `@modelcontextprotocol/ext-apps`,
 * so the published tarball stays lean; `test/ui.test.ts` asserts parity with the SDK.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/** The MCP Apps resource the workbench is served from. */
export const WORKBENCH_URI = 'ui://passwerk/workbench.html' as const;

/** MCP Apps spec 2026-01-26; equals the SDK's `RESOURCE_MIME_TYPE`. */
export const MCP_APP_MIME = 'text/html;profile=mcp-app' as const;

/**
 * Empty CSP arrays are stated, not omitted: the host may load nothing from the network for
 * this view, and the sovereignty claim is explicit on the wire.
 */
export const WORKBENCH_UI_META = {
  csp: { connectDomains: [] as string[], resourceDomains: [] as string[] },
  prefersBorder: true,
} as const;

export const WORKBENCH_NOT_BUILT =
  'The passwerk workbench is not built. Run `pnpm build:mcp-app` (or install a release build).';

/** How the server obtains the workbench HTML. `bin.ts` reads a file; tests pass a string. */
export interface UiLoader {
  html(): Promise<string>;
}

/**
 * Registers `ui://passwerk/workbench.html`. Without a loader, or when it fails, the read
 * answers with {@link WORKBENCH_NOT_BUILT}; `review_passport` keeps working as a text tool.
 */
export function registerWorkbench(server: McpServer, loader: UiLoader | undefined): void {
  server.registerResource(
    'workbench',
    WORKBENCH_URI,
    {
      title: 'passwerk workbench',
      description:
        'Interactive review of a battery passport draft (MCP Apps). Rendered by hosts that support ui:// resources; the same data is available as text from review_passport.',
      mimeType: MCP_APP_MIME,
    },
    async (uri) => {
      let html: string;
      try {
        if (!loader) throw new Error('no workbench loader configured');
        html = await loader.html();
      } catch {
        throw new McpError(ErrorCode.InternalError, WORKBENCH_NOT_BUILT);
      }
      return {
        contents: [
          { uri: uri.href, mimeType: MCP_APP_MIME, text: html, _meta: { ui: WORKBENCH_UI_META } },
        ],
      };
    },
  );
}
