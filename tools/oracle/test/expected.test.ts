import type { Finding, ValidationReport } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { buildExpected } from '../src/expected.js';

function finding(layer: 'L1' | 'L2' | 'L3', path: string): Finding {
  return {
    layer,
    ruleId: `PW-${layer}-X`,
    severity: 'error',
    path,
    message: { de: 'x', en: 'x' },
  };
}

function report(findings: Finding[]): ValidationReport {
  const count = (layer: 'L1' | 'L2' | 'L3') =>
    findings.filter((f) => f.layer === layer && f.severity === 'error').length;
  return {
    verdict: findings.some((f) => f.severity === 'error') ? 'invalid' : 'valid',
    findings,
    layers: {
      L1: { ran: true, errors: count('L1'), warnings: 0 },
      L2: { ran: true, errors: count('L2'), warnings: 0 },
      L3: { ran: true, errors: count('L3'), warnings: 0 },
      L4: { ran: false, errors: 0, warnings: 0 },
    },
  };
}

describe('buildExpected', () => {
  it('expects the oracle to pass exactly when L2 has zero errors', () => {
    const set = buildExpected('@passwerk/core 0.0.0', [
      {
        sample: 'b',
        format: 'json',
        sha256: 'bb',
        report: report([finding('L2', '/submodels/0')]),
      },
      {
        sample: 'a',
        format: 'aasx',
        sha256: 'aa',
        report: report([finding('L3', '/x'), finding('L1', 'attributes.y')]),
      },
    ]);
    expect(set.generatedBy).toBe('@passwerk/core 0.0.0');
    expect(set.files.map((f) => f.file)).toEqual(['a.aasx', 'b.aas.json']);
    expect(set.files[0]).toEqual({
      sample: 'a',
      file: 'a.aasx',
      format: 'aasx',
      sha256: 'aa',
      passwerk: { verdict: 'invalid', l1Errors: 1, l2Errors: 0, l3Errors: 1 },
      expectedOracleOk: true,
      l2Findings: [],
    });
    expect(set.files[1]?.expectedOracleOk).toBe(false);
    expect(set.files[1]?.l2Findings).toEqual(['/submodels/0: x']);
  });

  it('ignores L2 warnings when deciding the expected oracle verdict', () => {
    const warning: Finding = { ...finding('L2', '/w'), severity: 'warning' };
    const set = buildExpected('x', [
      { sample: 'c', format: 'json', sha256: 'cc', report: report([warning]) },
    ]);
    expect(set.files[0]?.expectedOracleOk).toBe(true);
    expect(set.files[0]?.l2Findings).toEqual([]);
  });
});
