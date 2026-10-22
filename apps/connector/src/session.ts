/**
 * One Durable Object per signed-in GitHub user (ADR D-046). It keeps that user's
 * `SessionStore` in memory, so the bundle, facts and draft ids one tool call returns are still
 * there for the next. Each MCP request gets a fresh server and a stateless transport over the
 * shared store: the protocol carries no session, the store does.
 *
 * The store lives in memory only. When the object is evicted after a quiet spell the ids are
 * gone; they are content-addressed, so sending the same documents again returns the same ids.
 */
// Registers pdf.js's worker module before any PDF is read; must stay the first import.
import './pdf-worker.js';
import { DurableObject } from 'cloudflare:workers';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer, type Logger, SessionStore, type UiLoader } from '@passwerk/server';
// Built by `pnpm build:mcp-app` (ADR D-037); wrangler bundles it as a text module.
import workbenchHtml from '../../../packages/server/ui/workbench.html';
import type { Env } from './env.js';

const log: Logger = (level, message, data) => {
  // Tool names, timings and errors only: never documents or drafts.
  const line = JSON.stringify({ level, message, ...(data === undefined ? {} : { data }) });
  if (level === 'error') console.error(line);
  else console.log(line);
};

const ui: UiLoader = { html: async () => workbenchHtml };

export class PasswerkSession extends DurableObject<Env> {
  private readonly store = new SessionStore();

  override async fetch(request: Request): Promise<Response> {
    // No `fs` and no `workspace`: documents arrive as inline bytes and files leave as bytes,
    // so nothing is read from or written to the server's disk (ADR D-045, D-046).
    const { server } = createServer({ store: this.store, ui, log });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      await server.close();
    }
  }
}
