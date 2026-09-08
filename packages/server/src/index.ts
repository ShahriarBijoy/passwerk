/**
 * @passwerk/server: MCP server for passwerk. Adapter only (ADR D-001): every domain rule
 * lives in `@passwerk/core`. This entry imports nothing from `node:*` so `createServer` can
 * run wherever core runs; `bin.ts`, `http.ts` and `fs.ts` are the Node-only entry points.
 */
export const PACKAGE_NAME = '@passwerk/server' as const;

export { decodeBase64, encodeBase64 } from './base64.js';
export { SERVER_NAME, SERVER_VERSION, TRANSPORTS } from './meta.js';
export { PROMPT_NAMES } from './prompts/index.js';
export { BundleRef, DraftRef, FactsRef, UnknownIdError } from './refs.js';
export { TOOLS, toolByName } from './registry.js';
export { STATIC_RESOURCE_URIS, TEMPLATE_RESOURCE_URIS } from './resources/index.js';
export { createServer, errorResult, type ServerOptions } from './server.js';
export { contentId, ID_PREFIX, SessionStore, type StoreKind, type StoreStats } from './session.js';
export type {
  AnyToolDefinition,
  FileSystemAdapter,
  Lang,
  LangText,
  Logger,
  LogLevel,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from './types.js';
export { LangSchema, PathOutsideRootError, pick } from './types.js';
export {
  MCP_APP_MIME,
  type UiLoader,
  WORKBENCH_NOT_BUILT,
  WORKBENCH_UI_META,
  WORKBENCH_URI,
} from './ui.js';
