import { AnyField, Field, Provenance } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('Provenance', () => {
  it('requires a file and accepts page and cell', () => {
    expect(Provenance.safeParse({ file: 'bom.xlsx', page: 2, cell: 'C7' }).success).toBe(true);
    expect(Provenance.safeParse({ page: 2 }).success).toBe(false);
  });
});

describe('Field', () => {
  const F = Field(z.string());
  it('defaults status to missing and source to []', () => {
    expect(F.parse({})).toEqual({ source: [], status: 'missing' });
  });
  it('present requires a value', () => {
    expect(F.safeParse({ status: 'present' }).success).toBe(false);
    expect(F.safeParse({ status: 'present', value: 'x' }).success).toBe(true);
  });
  it('a value requires status present or conflict', () => {
    expect(F.safeParse({ value: 'x', status: 'missing' }).success).toBe(false);
    expect(F.safeParse({ value: 'x', status: 'conflict' }).success).toBe(true);
  });
  it('confidence is within 0..1', () => {
    expect(F.safeParse({ value: 'x', status: 'present', confidence: 1.2 }).success).toBe(false);
  });
  it('AnyField accepts any value', () => {
    expect(AnyField.safeParse({ value: { a: 1 }, status: 'present' }).success).toBe(true);
  });
});

describe('Field.recordedAt', () => {
  it('accepts an ISO date-time', () => {
    expect(
      AnyField.safeParse({ value: '70', status: 'present', recordedAt: '2026-08-31T06:00:00Z' })
        .success,
    ).toBe(true);
  });
  it('rejects a German date', () => {
    expect(
      AnyField.safeParse({ value: '70', status: 'present', recordedAt: '31.08.2026' }).success,
    ).toBe(false);
  });
});
