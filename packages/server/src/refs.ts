import {
  DocumentBundle,
  FactSet,
  type PassportDraft,
  PassportDraftError,
  validateSchema,
} from '@passwerk/core';
import { z } from 'zod';
import type { StoreKind } from './session.js';
import type { ToolContext } from './types.js';

/** Wire schemas stay compact (spec section 3.2); core validates the object in the handler. */
export const DraftRef = z
  .union([z.looseObject({ draftId: z.string().min(1) }), z.looseObject({ meta: z.unknown() })])
  .describe('A PassportDraft object, or { draftId } as returned by an earlier call');

export const BundleRef = z
  .union([
    z.looseObject({ bundleId: z.string().min(1) }),
    z.looseObject({ documents: z.unknown() }),
  ])
  .describe('A DocumentBundle object, or { bundleId } as returned by ingest_documents');

export const FactsRef = z
  .union([z.looseObject({ factSetId: z.string().min(1) }), z.looseObject({ facts: z.unknown() })])
  .describe('A FactSet object, or { factSetId } as returned by extract_facts');

export class UnknownIdError extends Error {
  constructor(kind: StoreKind, id: string) {
    super(`Unknown ${kind} id "${id}". Ids live for one connection; re-send the object.`);
    this.name = 'UnknownIdError';
  }
}

export async function resolveDraft(
  ref: unknown,
  ctx: ToolContext,
): Promise<{ draft: PassportDraft; draftId: string }> {
  const r = ref as { draftId?: unknown };
  if (typeof r.draftId === 'string') {
    const draft = ctx.store.get<PassportDraft>('draft', r.draftId);
    if (!draft) throw new UnknownIdError('draft', r.draftId);
    return { draft, draftId: r.draftId };
  }
  const l1 = validateSchema(ref);
  if (!l1.draft) throw new PassportDraftError(l1.findings);
  const draftId = await ctx.store.put('draft', l1.draft);
  return { draft: l1.draft, draftId };
}

export async function resolveBundle(
  ref: unknown,
  ctx: ToolContext,
): Promise<{ bundle: DocumentBundle; bundleId: string }> {
  const r = ref as { bundleId?: unknown };
  if (typeof r.bundleId === 'string') {
    const bundle = ctx.store.get<DocumentBundle>('bundle', r.bundleId);
    if (!bundle) throw new UnknownIdError('bundle', r.bundleId);
    return { bundle, bundleId: r.bundleId };
  }
  const bundle = DocumentBundle.parse(ref);
  const bundleId = await ctx.store.put('bundle', bundle);
  return { bundle, bundleId };
}

export async function resolveFacts(
  ref: unknown,
  ctx: ToolContext,
): Promise<{ facts: FactSet; factSetId: string }> {
  const r = ref as { factSetId?: unknown };
  if (typeof r.factSetId === 'string') {
    const facts = ctx.store.get<FactSet>('facts', r.factSetId);
    if (!facts) throw new UnknownIdError('facts', r.factSetId);
    return { facts, factSetId: r.factSetId };
  }
  const facts = FactSet.parse(ref);
  const factSetId = await ctx.store.put('facts', facts);
  return { facts, factSetId };
}
