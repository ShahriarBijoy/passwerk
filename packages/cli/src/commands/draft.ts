/** Shared by audit, emit and gaps: read a draft file, call a tool, map the outcome. */
import type { Finding, Verdict } from '@passwerk/core';
import type { ToolContext } from '@passwerk/server';
import { readJsonFile } from '../format.js';
import { type InvokeResult, invoke, toolContext } from '../invoke.js';
import type { CliIo } from '../io.js';

export interface DraftOutcome {
  result: InvokeResult;
  /** `undefined` when the tool failed for a reason other than validation (a usage error). */
  verdict?: Verdict;
  findings: Finding[];
  ctx: ToolContext;
}

export async function invokeOnDraft(
  io: CliIo,
  tool: string,
  path: string,
  input: Record<string, unknown>,
): Promise<DraftOutcome> {
  const draft = await readJsonFile(io, path);
  const ctx = toolContext(io);
  const result = await invoke(tool, { draft, ...input }, ctx);
  const findings = (result.structured['findings'] as Finding[] | undefined) ?? [];
  if (result.isError && findings.length === 0) return { result, findings, ctx };
  // A structurally invalid draft (L1) arrives as an error carrying findings: still a verdict.
  const verdict = (result.structured['verdict'] as Verdict | undefined) ?? 'invalid';
  return { result, verdict, findings, ctx };
}
