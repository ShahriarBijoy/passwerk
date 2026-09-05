import { valueSchemaFor } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { type LangText, t } from '../i18n/index.ts';

export type ValueCheck = { ok: true } | { ok: false; message: LangText };

/**
 * Check one user-typed value against core's schema for the attribute, so a value that
 * `applyMappings` would reject never becomes a decision (it throws there). A composite leaf
 * passes: core checks only the path for those and leaves the leaf value to L1, so there is no
 * leaf schema to run here.
 */
export function validateValue(
  attributeId: string,
  path: string | undefined,
  value: string,
): ValueCheck {
  const attribute = getAttribute(attributeId);
  if (!attribute || attribute.valueKind === 'composite' || path !== undefined) return { ok: true };
  const result = valueSchemaFor(attribute).safeParse(value);
  if (result.success) return { ok: true };
  const reason = result.error.issues.map((i) => i.message).join('; ');
  return {
    ok: false,
    message: {
      de: t('de', 'review.value.invalid', { attribute: attribute.name.de, reason }),
      en: t('en', 'review.value.invalid', { attribute: attribute.name.en, reason }),
    },
  };
}
