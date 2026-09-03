import { attributes } from '@passwerk/rules';
import { z } from 'zod';

/** The 93 DIN DKE SPEC 99100 attribute ids, in longlist order, from the knowledge base. */
export const ATTRIBUTE_IDS: readonly string[] = attributes.map((a) => a.id);

const first = ATTRIBUTE_IDS[0];
if (first === undefined) throw new Error('@passwerk/core: knowledge base has no attributes');

export const AttributeIdSchema = z.enum([first, ...ATTRIBUTE_IDS.slice(1)]);
/** Runtime-checked; the literal union is not expressible because ids come from data. */
export type AttributeId = string;

const idSet = new Set(ATTRIBUTE_IDS);
export function isAttributeId(s: string): boolean {
  return idSet.has(s);
}
