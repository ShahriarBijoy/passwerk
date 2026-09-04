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

/** The attribute's authored band, or a generous default when none is authored (ADR D-021). */
function bandFor(attribute: (typeof NUMERIC)[number]): { min: number; max: number } {
  const { range, valueKind } = attribute;
  if (range === null) {
    return valueKind === 'percentage' ? { min: 0, max: 100 } : { min: 0, max: 100000 };
  }
  return { min: range.min ?? 0, max: range.max ?? 100000 };
}

/**
 * Same shape as draftArb (category, up to 12 distinct numeric attributes), but every value is
 * drawn inside the attribute's authored band, so L1 accepts it and L4 actually gets to
 * evaluate rules that need in-band values — voltage ordering (002), the 2 kWh threshold (005),
 * energy coherence (016), the percentage-ordering rules (020, 021, 022) and more. draftArb's
 * wide uniform [-2000, 20000] range mostly misses those bands and L1 rejects the rest.
 */
const inBandDraftArb = fc
  .tuple(
    categoryArb,
    fc.uniqueArray(fc.integer({ min: 0, max: NUMERIC.length - 1 }), { maxLength: 12 }),
  )
  .chain(([category, indices]) =>
    fc
      .tuple(
        ...indices.map((index) => {
          const attribute = NUMERIC[index]!;
          const { min, max } = bandFor(attribute);
          return fc.integer({ min, max }).map((raw) => {
            if (attribute.valueKind === 'integer') return String(raw);
            // Append .5 only when the fractional value still fits inside the band.
            return raw + 0.5 <= max ? `${raw}.5` : String(raw);
          });
        }),
      )
      .map((values) => {
        const entries = indices.map((index, i) => {
          const attribute = NUMERIC[index]!;
          return [attribute.id, { value: values[i]!, status: 'present', source: [] }];
        });
        return { meta: { ...META, category }, attributes: Object.fromEntries(entries) };
      }),
  );

/** Coverage evidence for the in-band arbitrary: which PW-PLAUS-* rules it actually fired. */
const inBandCoveredRuleIds = new Set<string>();

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

    fc.assert(
      fc.property(inBandDraftArb, (input) => {
        const parsed = PassportDraft.safeParse(input);
        if (!parsed.success) return;
        let findings: ReturnType<typeof validatePlausibility>['findings'] = [];
        expect(() => {
          findings = validatePlausibility(parsed.data).findings;
        }).not.toThrow();
        for (const finding of findings) inBandCoveredRuleIds.add(finding.ruleId);
      }),
      RUN,
    );
    // Coverage evidence, logged not asserted: which rules the in-band arbitrary actually fires.
    console.log(
      'L4 in-band coverage (fired rule ids):',
      [...inBandCoveredRuleIds].sort().join(', '),
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
    for (const arb of [draftArb, inBandDraftArb]) {
      fc.assert(
        fc.property(arb, (input) => {
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
    }
  });

  it('produces findings only for rules that exist, with both languages filled', () => {
    for (const arb of [draftArb, inBandDraftArb]) {
      fc.assert(
        fc.property(arb, (input) => {
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
    }
  });
});
