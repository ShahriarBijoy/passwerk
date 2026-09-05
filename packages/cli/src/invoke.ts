/**
 * In-process tool calls. Every command goes through here so the CLI runs the same handler,
 * with the same parsed input, that the MCP server runs (ADR D-031). The error mapping mirrors
 * `errorResult` in the server: a thrown error becomes a fail-honest result, never a crash.
 */
import { PassportDraftError } from '@passwerk/core';
import {
  type LangText,
  type Logger,
  PathOutsideRootError,
  SessionStore,
  type ToolContext,
  toolByName,
  UnknownIdError,
} from '@passwerk/server';
import { z } from 'zod';
import type { CliIo } from './io.js';

const noopLog: Logger = () => {};

export function toolContext(io: CliIo): ToolContext {
  return { store: new SessionStore(), fs: io.fs, clock: io.clock, log: noopLog };
}

export interface InvokeResult {
  structured: Record<string, unknown>;
  text: LangText;
  isError: boolean;
}

export async function invoke(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<InvokeResult> {
  const tool = toolByName(name);
  if (!tool) throw new Error(`Unknown tool "${name}"`);
  try {
    const parsed = z.object(tool.inputSchema).parse(input);
    const r = await tool.handler(parsed, ctx);
    return {
      structured: r.structured as Record<string, unknown>,
      text: r.text,
      isError: r.isError === true,
    };
  } catch (e) {
    return errorResult(e);
  }
}

function errorResult(e: unknown): InvokeResult {
  if (e instanceof PassportDraftError) {
    return {
      isError: true,
      structured: { error: e.message, findings: e.findings },
      text: {
        de: 'Der PassportDraft ist strukturell ungültig.',
        en: 'The PassportDraft is structurally invalid.',
      },
    };
  }
  if (e instanceof z.ZodError) {
    const issues = e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    const message = `invalid input: ${issues.join('; ')}`;
    return {
      isError: true,
      structured: { error: message },
      text: { de: `Ungültige Eingabe: ${issues.join('; ')}`, en: message },
    };
  }
  const message =
    e instanceof UnknownIdError || e instanceof PathOutsideRootError || e instanceof Error
      ? e.message
      : String(e);
  return { isError: true, structured: { error: message }, text: { de: message, en: message } };
}
