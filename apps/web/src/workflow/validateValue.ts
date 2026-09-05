import { valueSchemaFor } from '@passwerk/core';
import { type Attribute, getAttribute } from '@passwerk/rules';
import { type LangText, t } from '../i18n/index.ts';
import { leafSchemaAt } from './compositeSchema.ts';

export type ValueCheck = { ok: true } | { ok: false; message: LangText };

const OK: ValueCheck = { ok: true };

function invalid(attribute: Attribute, reason: string): ValueCheck {
  return {
    ok: false,
    message: {
      de: t('de', 'review.value.invalid', { attribute: attribute.name.de, reason }),
      en: t('en', 'review.value.invalid', { attribute: attribute.name.en, reason }),
    },
  };
}

const reasonOf = (issues: { message: string }[]): string => issues.map((i) => i.message).join('; ');

/**
 * Check one user-typed value against core's schema, so a value that `applyMappings` or
 * `validate` would reject never becomes a decision.
 *
 * A composite is entered leaf by leaf: core waves a whole-composite value through
 * (`checkLeaf` leaves its shape to L1), which means a raw string sails past `applyMappings`
 * and only blows up later inside `validate`. So the whole value is refused here, and a leaf
 * is checked against the schema its dotted path resolves to.
 *
 * `recordedAt` is the reviewer's LastUpdate for a dynamic value, as the browser's
 * `datetime-local` input spells it. Only its parsability is checked; whether the instant is
 * plausible is L4's call (PW-PLAUS-011).
 */
export function validateValue(
  attributeId: string,
  path: string | undefined,
  value: string,
  recordedAt?: string,
): ValueCheck {
  if (recordedAt !== undefined && Number.isNaN(new Date(recordedAt).getTime())) {
    return {
      ok: false,
      message: {
        de: t('de', 'review.recordedAt.invalid'),
        en: t('en', 'review.recordedAt.invalid'),
      },
    };
  }
  const attribute = getAttribute(attributeId);
  if (!attribute) return OK;
  if (attribute.valueKind === 'composite') {
    if (path === undefined) {
      return {
        ok: false,
        message: {
          de: t('de', 'review.value.compositeWhole'),
          en: t('en', 'review.value.compositeWhole'),
        },
      };
    }
    const leaf = leafSchemaAt(attributeId, path);
    if (!leaf) return invalid(attribute, `"${path}" is not a sub-field of this composite`);
    const parsed = leaf.safeParse(value);
    return parsed.success ? OK : invalid(attribute, reasonOf(parsed.error.issues));
  }
  if (path !== undefined) return OK;
  const result = valueSchemaFor(attribute).safeParse(value);
  return result.success ? OK : invalid(attribute, reasonOf(result.error.issues));
}
