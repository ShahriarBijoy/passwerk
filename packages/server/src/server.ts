import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PassportDraftError } from '@passwerk/core';
import { z } from 'zod';
import { SERVER_NAME, SERVER_VERSION } from './meta.js';
import { registerPrompts } from './prompts/index.js';
import { UnknownIdError } from './refs.js';
import { TOOLS } from './registry.js';
import { registerResources } from './resources/index.js';
import { SessionStore } from './session.js';
import {
  type FileSystemAdapter,
  type Lang,
  LangSchema,
  type Logger,
  PathOutsideRootError,
  pick,
  type ToolContext,
} from './types.js';
import { registerWorkbench, type UiLoader } from './ui.js';

export interface ServerOptions {
  /** Without one, `ingest_documents` accepts inline bytes only and `emit_passport` returns bytes. */
  fs?: FileSystemAdapter;
  store?: SessionStore;
  /** ISO date-time used as "now" where a caller gives none. Fixed in tests. */
  clock?: string;
  log?: Logger;
  /** Log tool payloads (sizes at info, bodies at debug). Off by default. */
  logPayloads?: boolean;
  /**
   * Serves `ui://passwerk/workbench.html` (the MCP App, ADR D-037). Without one the resource
   * answers with the not-built error and `review_passport` stays a text tool.
   */
  ui?: UiLoader;
}

const noopLog: Logger = () => {};

/** Turns a thrown error into a fail-honest tool result. */
export function errorResult(e: unknown, lang: Lang | undefined) {
  if (e instanceof PassportDraftError) {
    const lines = e.findings.map(
      (f) => `- [${f.layer}] ${f.ruleId} ${f.path}: ${pick(f.message, lang)}`,
    );
    const head =
      lang === 'de'
        ? 'Der PassportDraft ist strukturell ungültig:'
        : 'The PassportDraft is structurally invalid:';
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: [head, ...lines].join('\n') }],
      structuredContent: { error: e.message, findings: e.findings },
    };
  }
  if (e instanceof z.ZodError) {
    const issues = e.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`);
    const head = lang === 'de' ? 'Ungültige Eingabe:' : 'Invalid input:';
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: [head, ...issues].join('\n') }],
      structuredContent: { error: `invalid input: ${issues.join('; ')}` },
    };
  }
  if (e instanceof UnknownIdError || e instanceof PathOutsideRootError) {
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: e.message }],
      structuredContent: { error: e.message },
    };
  }
  const message = e instanceof Error ? e.message : String(e);
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: message }],
    structuredContent: { error: message },
  };
}

export function createServer(options: ServerOptions = {}): {
  server: McpServer;
  ctx: ToolContext;
} {
  const log = options.log ?? noopLog;
  const ctx: ToolContext = {
    store: options.store ?? new SessionStore(),
    ...(options.fs ? { fs: options.fs } : {}),
    clock: options.clock ?? new Date().toISOString(),
    log,
  };
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: {
          ...tool.inputSchema,
          lang: LangSchema.optional().describe('Language of the text summary (default en)'),
        },
        // Loose: core's objects carry more keys than the compact wire schema names.
        outputSchema: z.looseObject(tool.outputSchema),
        annotations: tool.annotations,
        // MCP Apps (extension io.modelcontextprotocol/ui): the host renders this tool's result
        // with the named ui:// resource. Visibility: the model may call it, and so may the app.
        ...(tool.ui
          ? {
              _meta: {
                ui: { resourceUri: tool.ui.resourceUri, visibility: ['model', 'app'] },
              },
            }
          : {}),
      },
      async (input: Record<string, unknown>) => {
        const { lang, ...rest } = input as { lang?: Lang };
        const started = Date.now();
        try {
          const r = await tool.handler(rest, ctx);
          if (options.logPayloads) {
            log('info', `tool ${tool.name}`, {
              ms: Date.now() - started,
              inBytes: JSON.stringify(rest).length,
              outBytes: JSON.stringify(r.structured).length,
              isError: r.isError === true,
            });
            log('debug', `tool ${tool.name} payload`, { input: rest, output: r.structured });
          }
          return {
            content: [{ type: 'text' as const, text: pick(r.text, lang) }],
            structuredContent: r.structured as Record<string, unknown>,
            ...(r.isError ? { isError: true as const } : {}),
          };
        } catch (e) {
          log('error', `tool ${tool.name} failed`, { message: e instanceof Error ? e.message : e });
          return errorResult(e, lang);
        }
      },
    );
  }

  registerResources(server, ctx);
  registerWorkbench(server, options.ui);
  registerPrompts(server);

  return { server, ctx };
}
