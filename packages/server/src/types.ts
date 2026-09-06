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
  /** Core's `InputFile.bytes` is `Uint8Array<ArrayBuffer>`; a fresh `Uint8Array` always is. */
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  stat(path: string): Promise<{ kind: 'file' | 'directory' | 'missing' }>;
  /** Direct children of a directory: names, not paths. */
  readDir(path: string): Promise<string[]>;
  /**
   * Absolute, normalised, lexical. Throws {@link PathOutsideRootError} when a root is
   * configured and the path escapes it lexically. Every operation above re-checks the
   * canonical target (symlinks resolved), so this is the first gate, not the only one.
   */
  resolve(path: string): string;
  join(...parts: string[]): string;
  /** The last path segment. */
  basename(path: string): string;
  /** Stable document identity: the path relative to the root (or cwd), forward slashes. */
  relative(path: string): string;
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

export interface ToolResult<O extends object = object> {
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
  /**
   * `structured` is validated against `outputSchema` by the SDK at call time; it is typed as
   * `object` here because loose schemas infer index signatures that core's interfaces lack.
   */
  handler(input: z.infer<z.ZodObject<I>>, ctx: ToolContext): Promise<ToolResult<object>>;
}

/** The structured shape of a failed call (see `errorResult` in server.ts). */
export interface ErrorOutput {
  error: string;
  findings?: Finding[];
}

/** The fail-honest result every tool returns when `outDir` is given but no file system was injected. */
export function noFileSystemResult(): ToolResult<ErrorOutput> {
  const message =
    'File output needs a file system; this server was started without one. Omit outDir to receive bytes inline.';
  return {
    isError: true,
    structured: { error: message },
    text: {
      de: 'Dateiausgabe braucht ein Dateisystem; dieser Server wurde ohne eines gestartet. outDir weglassen, um die Bytes inline zu erhalten.',
      en: message,
    },
  };
}

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
