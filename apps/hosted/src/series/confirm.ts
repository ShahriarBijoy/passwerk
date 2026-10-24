/**
 * Turns the values the AI reading held into `elicitation/create` questions for the client, and
 * the answers back into readings with those values confirmed or still held (ADR D-049).
 */
import { byCodePoint } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { z } from 'zod';
import { type HeldValue, type ReadingResult, slotKey } from '../reading/index.js';
import type { InputRequest, InputRequests, InputResponses } from '../tasks.js';

/** Claude Code ignores keys beyond 16 in one task. */
export const MAX_QUESTIONS = 16;

/** A model whose reading held values. */
export interface HeldModel {
  modelId: string;
  reading: ReadingResult;
}

export interface Confirmation {
  inputRequests: InputRequests;
  /** One reading per held model, in order, with every applied value moved to `confirmed`. */
  readingsFor(responses: InputResponses): ReadingResult[];
}

/** A held value with its model and its place in that model's `held`. */
interface Ref {
  model: number;
  modelId: string;
  held: number;
  value: HeldValue;
}

interface Ask {
  /** Without its number, which depends on the position. */
  name: string;
  message: string;
  applyTitle: string;
  covers: Ref[];
}

const MAX_ROWS = 3;
const MAX_CELL = 80;
const MAX_LISTED = 3;

const Applied = z.object({
  action: z.literal('accept'),
  content: z.object({ answer: z.literal('apply') }),
});

const clip = (s: string) => (s.length <= MAX_CELL ? s : `${s.slice(0, MAX_CELL - 1)}…`);

function leaves(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(leaves);
  return value === undefined || value === null ? [] : [String(value)];
}

/** Lists show their first rows, so a long table fits in a dialog. */
function shown({ value, unit }: HeldValue['decision']): string {
  if (Array.isArray(value)) {
    const rows = value.slice(0, MAX_ROWS).map((row) => clip(leaves(row).join(', ')));
    const more = value.length - rows.length;
    const head = `${value.length} ${value.length === 1 ? 'row' : 'rows'}${unit ? ` (${unit})` : ''}`;
    return `${head}: ${rows.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
  }
  const text = clip(leaves(value).join(', '));
  return unit ? `${text} ${unit}` : text;
}

const words = (segment: string) => segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

function label({ attributeId, path }: HeldValue['decision']): string {
  const name = getAttribute(attributeId)?.name.en ?? attributeId;
  return path === undefined ? name : [name, ...path.split('.').map(words)].join(' › ');
}

const percent = (confidence: number) => `${Math.round(confidence * 100)} %`;

function perValue(models: HeldModel[]): Ask[] {
  return models.flatMap((m, model) =>
    m.reading.held.map((h, held) => ({
      name: slotKey(h.decision),
      message:
        `${label(h.decision)}: ${shown(h.decision)}\n` +
        `The AI reading found this in ${h.where} (confidence ${percent(h.decision.confidence)}) ` +
        'but did not apply it on its own. Put it in the passport?',
      applyTitle: 'Apply this value',
      covers: [{ model, modelId: m.modelId, held, value: h }],
    })),
  );
}

function perAttribute(models: HeldModel[], modelCount: number): Ask[] {
  const bySlot = new Map<string, { label: string; covers: Ref[] }>();
  for (const [model, m] of models.entries()) {
    for (const [held, h] of m.reading.held.entries()) {
      const slot = slotKey(h.decision);
      const entry = bySlot.get(slot) ?? { label: label(h.decision), covers: [] };
      entry.covers.push({ model, modelId: m.modelId, held, value: h });
      bySlot.set(slot, entry);
    }
  }
  const slots = [...bySlot.entries()].sort(([a], [b]) => byCodePoint(a, b));
  return slots.map(([slot, { label: name, covers }]) => {
    const inModels = new Set(covers.map((r) => r.model)).size;
    const lines = covers
      .slice(0, MAX_LISTED)
      .map(
        ({ modelId, value: h }) =>
          `${modelId}: ${shown(h.decision)} (${h.where}, ${percent(h.decision.confidence)})`,
      );
    const more = covers.length - lines.length;
    return {
      name: slot,
      message:
        `${name}: the AI reading found a value in ` +
        `${inModels} of ${modelCount} models but did not apply it on its own.\n` +
        `${lines.join('\n')}${more > 0 ? `\nand ${more} more` : ''}\n` +
        `Apply the value it read in all ${inModels} models?`,
      applyTitle: `Apply in all ${inModels} models`,
      covers,
    };
  });
}

/** The asks from the last question on become one question for all of them. */
function capped(asks: Ask[]): Ask[] {
  if (asks.length <= MAX_QUESTIONS) return asks;
  const rest = asks.slice(MAX_QUESTIONS - 1);
  const covers = rest.flatMap((a) => a.covers);
  const names = [...new Set(covers.map((r) => label(r.value.decision)))];
  const listed = names.slice(0, MAX_LISTED * 2);
  const unlisted = names.length - listed.length;
  return [
    ...asks.slice(0, MAX_QUESTIONS - 1),
    {
      name: 'rest',
      message:
        `${rest.length} more values the AI reading did not apply on its own: ` +
        `${listed.join('; ')}${unlisted > 0 ? `; and ${unlisted} more` : ''}.\n` +
        'There are more held values than one task can ask about, so this question covers them all. ' +
        'Apply every one of them?',
      applyTitle: `Apply all ${rest.length}`,
      covers,
    },
  ];
}

function request({ message, applyTitle }: Ask): InputRequest {
  return {
    method: 'elicitation/create',
    params: {
      mode: 'form',
      message,
      requestedSchema: {
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            title: 'Your answer',
            oneOf: [
              { const: 'apply', title: applyTitle },
              { const: 'skip', title: 'Skip it, leave the value open' },
            ],
          },
        },
        required: ['answer'],
      },
    },
  };
}

/**
 * One question per held value when the run has one model, one per held attribute (id and
 * path) across the models otherwise; never more than `MAX_QUESTIONS`.
 */
export function confirmationFor(models: HeldModel[], modelCount: number): Confirmation {
  const asks = capped(modelCount === 1 ? perValue(models) : perAttribute(models, modelCount));
  const keyed = asks.map((a, i) => [`${String(i + 1).padStart(2, '0')}-${a.name}`, a] as const);
  return {
    inputRequests: Object.fromEntries(keyed.map(([key, a]) => [key, request(a)])),
    readingsFor(responses) {
      const applied = new Set(
        keyed
          .filter(([key]) => Applied.safeParse(responses[key]).success)
          .flatMap(([, a]) => a.covers.map((r) => `${r.model}:${r.held}`)),
      );
      return models.map(({ reading }, model) => {
        const yes = (_: HeldValue, held: number) => applied.has(`${model}:${held}`);
        return {
          ...reading,
          held: reading.held.filter((h, i) => !yes(h, i)),
          confirmed: [...reading.confirmed, ...reading.held.filter(yes)],
        };
      });
    },
  };
}
