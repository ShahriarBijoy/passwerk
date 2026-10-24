import { getAttribute } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';
import type { HeldValue, ReadingResult } from '../src/reading/index.js';
import { confirmationFor, MAX_QUESTIONS } from '../src/series/confirm.js';

const PDF = 'lieferantenerklaerung.pdf';
const XLSX = 'stueckliste.xlsx';

function held(
  attributeId: string,
  value: unknown,
  o: { path?: string; unit?: string; where?: string; confidence?: number } = {},
): HeldValue {
  const file = o.where?.split(' ')[0] ?? XLSX;
  return {
    decision: {
      attributeId,
      ...(o.path ? { path: o.path } : {}),
      value,
      ...(o.unit ? { unit: o.unit } : {}),
      source: [{ file, note: 'read by jev-1.14.0' }],
      confidence: o.confidence ?? 0.9,
    },
    where: o.where ?? `${XLSX} sheet Ersatzteile, table T11`,
    reason: 'held for the test',
  };
}

const reading = (...values: HeldValue[]): ReadingResult => ({
  decisions: [],
  held: values,
  confirmed: [],
  vetoed: [],
  inputTokens: 0,
  requests: 0,
});

const PARTS = held('componentPartNumbers', [
  { partName: 'Battery management system', partNumber: 'MW-BMS-7' },
  { partName: 'Battery module', partNumber: 'MW-MOD-48-A' },
  { partName: 'Cooling plate', partNumber: 'MW-CP-12' },
  { partName: 'Fuse box', partNumber: 'MW-FB-2' },
  { partName: 'Wiring harness', partNumber: 'MW-WH-9' },
]);
const CITY = held('manufacturerInformation', 'Bremen', {
  path: 'address.cityTown',
  where: `${PDF} page 1, line 21`,
  confidence: 0.97,
});
const RESISTANCE = held('initialInternalResistance', '0.0125', {
  path: 'packOhm',
  unit: 'Ohm',
  confidence: 0.84,
});

const apply = { action: 'accept', content: { answer: 'apply' } };
const skip = { action: 'accept', content: { answer: 'skip' } };

type Params = {
  mode: string;
  message: string;
  requestedSchema: {
    type: string;
    properties: Record<string, { type: string; oneOf: { const: string; title: string }[] }>;
    required: string[];
  };
};
const paramsOf = (r: { params: Record<string, unknown> }) => r.params as Params;

describe('questions for one model', () => {
  const one = [{ modelId: 'upload', reading: reading(PARTS, RESISTANCE, CITY) }];

  it('asks one form question per held value, in the order held, with printable keys', () => {
    const { inputRequests } = confirmationFor(one, 1);
    const keys = Object.keys(inputRequests);
    expect(keys).toEqual([
      '01-componentPartNumbers',
      '02-initialInternalResistance.packOhm',
      '03-manufacturerInformation.address.cityTown',
    ]);
    for (const key of keys) expect(key).toMatch(/^[\x21-\x7e]{1,128}$/);
    for (const r of Object.values(inputRequests)) {
      expect(r.method).toBe('elicitation/create');
      const p = paramsOf(r);
      expect(p.mode).toBe('form');
      expect(p.requestedSchema.type).toBe('object');
      expect(p.requestedSchema.required).toEqual(['answer']);
      const field = p.requestedSchema.properties['answer'];
      expect(field?.type).toBe('string');
      expect(field?.oneOf.map((o) => o.const)).toEqual(['apply', 'skip']);
    }
  });

  it('names the attribute, the shortened value, the document and the confidence', () => {
    const { inputRequests } = confirmationFor(one, 1);
    const parts = paramsOf(inputRequests['01-componentPartNumbers'] as never).message;
    expect(parts).toContain(getAttribute('componentPartNumbers')?.name.en);
    expect(parts).toContain('Battery management system, MW-BMS-7');
    expect(parts).toContain('and 2 more');
    expect(parts).not.toContain('MW-WH-9');
    expect(parts).toContain('stueckliste.xlsx sheet Ersatzteile, table T11');
    expect(parts).toContain('90 %');
    const city = paramsOf(inputRequests['03-manufacturerInformation.address.cityTown'] as never);
    expect(city.message).toContain('Bremen');
    expect(city.message).toContain('lieferantenerklaerung.pdf page 1, line 21');
    expect(city.message).toContain('97 %');
    const resistance = paramsOf(inputRequests['02-initialInternalResistance.packOhm'] as never);
    expect(resistance.message).toContain('0.0125 Ohm');
  });

  it('confirms what is applied and skips decline, cancel, skip and missing answers', () => {
    const c = confirmationFor(one, 1);
    const [r] = c.readingsFor({
      '01-componentPartNumbers': apply,
      '02-initialInternalResistance.packOhm': { action: 'decline' },
      '03-manufacturerInformation.address.cityTown': apply,
    });
    expect(r?.confirmed).toEqual([PARTS, CITY]);
    expect(r?.held).toEqual([RESISTANCE]);
    for (const answer of [skip, { action: 'cancel' }, { action: 'accept' }, 'apply', undefined]) {
      const [s] = c.readingsFor({ '01-componentPartNumbers': answer });
      expect(s?.confirmed).toEqual([]);
      expect(s?.held).toEqual([PARTS, RESISTANCE, CITY]);
    }
  });
});

describe('questions for a series', () => {
  const series = [
    { modelId: 'model-01', reading: reading(PARTS, CITY) },
    { modelId: 'model-03', reading: reading(CITY) },
  ];

  it('asks once per held attribute for every model that held it', () => {
    const { inputRequests } = confirmationFor(series, 12);
    expect(Object.keys(inputRequests)).toEqual([
      '01-componentPartNumbers',
      '02-manufacturerInformation.address.cityTown',
    ]);
    const city = paramsOf(inputRequests['02-manufacturerInformation.address.cityTown'] as never);
    expect(city.message).toContain('2 of 12 models');
    expect(city.message).toContain('model-01');
    expect(city.message).toContain('model-03');
    expect(city.requestedSchema.properties['answer']?.oneOf[0]?.title).toContain('2 models');
  });

  it('applies one answer in every model that held the attribute', () => {
    const [first, third] = confirmationFor(series, 12).readingsFor({
      '02-manufacturerInformation.address.cityTown': apply,
      '01-componentPartNumbers': skip,
    });
    expect(first?.confirmed).toEqual([CITY]);
    expect(first?.held).toEqual([PARTS]);
    expect(third?.confirmed).toEqual([CITY]);
    expect(third?.held).toEqual([]);
  });

  it(`asks at most ${MAX_QUESTIONS} questions; the last one covers the rest`, () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      held('manufacturerInformation', `value ${i + 1}`, {
        path: `p${String(i + 1).padStart(2, '0')}`,
      }),
    );
    const c = confirmationFor(
      [
        { modelId: 'model-01', reading: reading(...many) },
        { modelId: 'model-02', reading: reading(...many) },
      ],
      2,
    );
    const keys = Object.keys(c.inputRequests);
    expect(keys).toHaveLength(MAX_QUESTIONS);
    expect(keys.at(-1)).toBe('16-rest');
    const rest = paramsOf(c.inputRequests['16-rest'] as never).message;
    expect(rest).toContain('5 more');
    expect(rest).toMatch(/more held values than one task can ask/);

    const [a, b] = c.readingsFor({ '16-rest': apply, '01-manufacturerInformation.p01': apply });
    const confirmedPaths = (r?: ReadingResult) => r?.confirmed.map((h) => h.decision.path);
    expect(confirmedPaths(a)).toEqual(['p01', 'p16', 'p17', 'p18', 'p19', 'p20']);
    expect(confirmedPaths(b)).toEqual(confirmedPaths(a));
    expect(a?.held).toHaveLength(14);
  });

  it('caps one model with more held values than questions the same way', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      held('manufacturerInformation', `v${i}`, { path: `q${String(i).padStart(2, '0')}` }),
    );
    const c = confirmationFor([{ modelId: 'upload', reading: reading(...many) }], 1);
    expect(Object.keys(c.inputRequests)).toHaveLength(MAX_QUESTIONS);
    const [r] = c.readingsFor({ '16-rest': apply });
    expect(r?.confirmed.map((h) => h.decision.path)).toEqual(['q15', 'q16']);
  });
});
