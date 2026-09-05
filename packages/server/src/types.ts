import type { Finding } from '@passwerk/core';
import { z } from 'zod';
import type { SessionStore } from './session.js';

export type Lang = 'de' | 'en';
export interface LangText {
  de: string;
  en: string;
}

export const LangSchema = z.enum(['de', 'en']);

export function pick(text: LangText, lang: Lang | undefined): string {
  return lang === 'de' ? text.de : text.en;
}

/**
 * The only way the server touches a file system. `bin.ts` injects the Node implementation;
 * tests inject an in-memory one; `createServer` without one accepts inline bytes only.
 */
export interface FileSystemAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  stat(path: string): Promise<{ kind: 'file' | 'directory' | 'missing' }>;
  /** Direct children of a directory: names, not paths. */
  readDir(path: string): Promise<string[]>;
  /** Absolute, normalised. Throws {@link PathOutsideRootError} when a root is configured. */
  resolve(path: string): string;
  join(...parts: string[]): string;
  /** The last path segment. */
  basename(path: string): string;
}

export class PathOutsideRootError extends Error {
  constructor(path: string, root: string) {
    super(`Path "${path}" is outside the configured root "${root}"`);
    this.name = 'PathOutsideRootError';
  }
}

export type LogLevel = 'info' | 'debug' | 'error';
export type Logger = (level: LogLevel, message: string, data?: unknown) => void;

export interface ToolContext {
  store: SessionStore;
  fs?: FileSystemAdapter;
  /** ISO date-time used as "now" when a caller gives no date. The only wall-clock input. */
  clock: string;
  log: Logger;
}

export interface ToolResult<O> {
  structured: O;
  text: LangText;
  isError?: boolean;
}

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: false;
  idempotentHint: boolean;
  openWorldHint: false;
}

/**
 * One MCP tool. `inputSchema` and `outputSchema` are raw Zod shapes so the SDK can derive
 * JSON schemas; `handler` receives parsed input without `lang` (the wrapper adds it).
 */
export interface ToolDefinition<I extends z.ZodRawShape, O extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  annotations: ToolAnnotations;
  handler(input: z.infer<z.ZodObject<I>>, ctx: ToolContext): Promise<ToolResult<ToolOutput<O>>>;
}

/** Every structured result may carry `error` and `findings` (the error shape, see server.ts). */
export type ToolOutput<O extends z.ZodRawShape> = z.infer<z.ZodObject<O>> & {
  error?: string;
  findings?: Finding[];
};

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry entries
export type AnyToolDefinition = ToolDefinition<any, any>;

/** Adds the error keys every output schema must accept so error results validate too. */
export function out<S extends z.ZodRawShape>(shape: S) {
  return {
    ...shape,
    error: z.string().optional().describe('Set when the call failed'),
  };
}

export const FindingSchema = z.looseObject({
  layer: z.enum(['L1', 'L2', 'L3', 'L4']),
  ruleId: z.string(),
  severity: z.enum(['error', 'warning']),
  path: z.string(),
  message: z.object({ de: z.string(), en: z.string() }),
});
