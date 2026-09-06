/**
 * A manual tool loop over `client.messages.create` (no beta helper, no streaming): every tool
 * call runs in-process through the registry, all results of one turn go back in one user
 * message, and the loop stops on `end_turn` or when the turn bound is reached.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { canonicalJson } from '@passwerk/core';
import type { ToolContext } from '@passwerk/server';
import { invoke } from '../invoke.js';
import type { Lang } from '../io.js';
import { anthropicTools } from './tools.js';
import type { CreateMessage } from './types.js';

export type LoopEvent =
  | { kind: 'text'; text: string }
  | { kind: 'call'; name: string; input: unknown }
  | { kind: 'result'; name: string; summary: string; isError: boolean };

export interface LoopOptions {
  createMessage: CreateMessage;
  model: string;
  system: string;
  message: string;
  maxTurns: number;
  ctx: ToolContext;
  lang: Lang;
  onEvent: (e: LoopEvent) => void;
}

export interface LoopResult {
  status: 'finished' | 'bound';
  turns: number;
}

const MAX_TOKENS = 16000;

export async function runAgentLoop(o: LoopOptions): Promise<LoopResult> {
  const tools = anthropicTools();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: o.message }];
  for (let turn = 1; turn <= o.maxTurns; turn++) {
    const response = await o.createMessage({
      model: o.model,
      max_tokens: MAX_TOKENS,
      system: o.system,
      tools,
      messages,
    });
    const toolUses: Anthropic.ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') o.onEvent({ kind: 'text', text: block.text });
      else if (block.type === 'tool_use') toolUses.push(block);
    }
    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      return { status: 'finished', turns: turn };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const input = (use.input ?? {}) as Record<string, unknown>;
      o.onEvent({ kind: 'call', name: use.name, input });
      const { lang: _lang, ...rest } = input as { lang?: unknown };
      const r = await invoke(use.name, rest, o.ctx);
      const text = o.lang === 'de' ? r.text.de : r.text.en;
      o.onEvent({
        kind: 'result',
        name: use.name,
        summary: r.isError ? `error: ${String(r.structured['error'])}` : text,
        isError: r.isError,
      });
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: `${text}\n\n${canonicalJson(r.structured).trimEnd()}`,
        ...(r.isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: 'user', content: results });
  }
  return { status: 'bound', turns: o.maxTurns };
}
