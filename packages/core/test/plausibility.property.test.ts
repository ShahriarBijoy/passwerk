import { CHECKS, PassportDraft, validatePlausibility, validateSchema } from '@passwerk/core';
import { attributes, BATTERY_CATEGORIES } from '@passwerk/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// Fixed seed: property tests must be as reproducible as every other output in this project.
const RUN = { seed: 20260904, numRuns: 300 } as const;

const META = {
  schemaVersion: '1.0' as const,
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://example.org/bp/1',
};

/** Attributes whose value is a plain decimal or integer string: easy to generate. */
const NUMERIC = attributes.filter(
  (a) => a.valueKind === 'decimal' || a.valueKind === 'integer' || a.valueKind === 'percentage',
);

const categoryArb = fc.constantFrom(...BATTERY_CATEGORIES);

/** A draft holding a random subset of numeric attributes with random in-band values. */
const draftArb = fc
  .tuple(
    categoryArb,
    fc.uniqueArray(fc.integer({ min: 0, max: NUMERIC.length - 1 }), { maxLength: 12 }),
    fc.array(fc.integer({ min: -2000, max: 20000 }), { minLength: 12, maxLength: 12 }),
  )
  .map(([category, indices, numbers]) => {
    const entries = indices.map((index, i) => {
      // NUMERIC[index] is typed `Attribute | undefined` under noUncheckedIndexedAccess, but
      // index is drawn from [0, NUMERIC.length - 1] so it always resolves.
      const attribute = NUMERIC[index]!;
      // numbers has minLength 12 and i % numbers.length is always in range.
      const raw = numbers[i % numbers.length]!;
      const value = attribute.valueKind === 'integer' ? String(raw) : `${raw}.5`;
      return [attribute.id, { value, status: 'present', source: [] }];
    });
    return { meta: { ...META, category }, attributes: Object.fromEntries(entries) };
  });

describe('L4 properties', () => {
  it('never fires on a draft with no attributes', () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        const draft = PassportDraft.parse({ meta: { ...META, category }, attributes: {} });
        expect(validatePlausibility(draft).findings).toEqual([]);
      }),
      RUN,
    );
  });

  it('never throws, whatever the draft holds', () => {
    fc.assert(
      fc.property(draftArb, (input) => {
        const parsed = PassportDraft.safeParse(input);
        if (!parsed.success) return;
        expect(() => validatePlausibility(parsed.data)).not.toThrow();
      }),
      RUN,
    );
  });

  it('never reports an attribute that L1 rejected', () => {
    fc.assert(
      fc.property(draftArb, (input) => {
        const l1 = validateSchema(input);
        if (!l1.draft) return;
        const rejected = new Set(
          l1.findings.filter((f) => f.severity === 'error').map((f) => f.attributeId),
        );
        const findings = validatePlausibility(l1.draft, { l1Findings: l1.findings }).findings;
        for (const finding of findings) {
          expect(rejected.has(finding.attributeId), finding.ruleId).toBe(false);
        }
      }),
      RUN,
    );
  });

  it('is independent of attribute insertion order', () => {
    fc.assert(
      fc.property(draftArb, (input) => {
        const parsed = PassportDraft.safeParse(input);
        if (!parsed.success) return;
        const reversed = PassportDraft.parse({
          meta: input.meta,
          attributes: Object.fromEntries(Object.entries(input.attributes).reverse()),
        });
        expect(validatePlausibility(reversed).findings).toEqual(
          validatePlausibility(parsed.data).findings,
        );
      }),
      RUN,
    );
  });

  it('produces findings only for rules that exist, with both languages filled', () => {
    fc.assert(
      fc.property(draftArb, (input) => {
        const parsed = PassportDraft.safeParse(input);
        if (!parsed.success) return;
        for (const finding of validatePlausibility(parsed.data).findings) {
          expect(Object.keys(CHECKS)).toContain(finding.ruleId);
          expect(finding.layer).toBe('L4');
          expect(finding.message.de.length).toBeGreaterThan(0);
          expect(finding.message.en.length).toBeGreaterThan(0);
          expect(finding.message.de).not.toMatch(/\{\w+\}/);
          expect(finding.message.en).not.toMatch(/\{\w+\}/);
        }
      }),
      RUN,
    );
  });
});
