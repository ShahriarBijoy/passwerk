import type { ValidationReport, Verdict } from '@passwerk/core';

export type OracleFormat = 'json' | 'aasx';

export interface ExpectedInput {
  sample: string;
  format: OracleFormat;
  sha256: string;
  report: ValidationReport;
}

export interface ExpectedFile {
  sample: string;
  file: string;
  format: OracleFormat;
  sha256: string;
  passwerk: { verdict: Verdict; l1Errors: number; l2Errors: number; l3Errors: number };
  /**
   * Parity rule (ADR D-012): aas-test-engines checks the AAS metamodel only, so it must
   * report ok exactly when passwerk's L2 (aas-core verification) has zero errors.
   */
  expectedOracleOk: boolean;
  l2Findings: string[];
}

export interface ExpectedFileSet {
  generatedBy: string;
  files: ExpectedFile[];
}

export function fileNameFor(sample: string, format: OracleFormat): string {
  return format === 'json' ? `${sample}.aas.json` : `${sample}.aasx`;
}

export function buildExpected(generatedBy: string, inputs: ExpectedInput[]): ExpectedFileSet {
  const files = inputs
    .map(
      ({ sample, format, sha256, report }): ExpectedFile => ({
        sample,
        file: fileNameFor(sample, format),
        format,
        sha256,
        passwerk: {
          verdict: report.verdict,
          l1Errors: report.layers.L1.errors,
          l2Errors: report.layers.L2.errors,
          l3Errors: report.layers.L3.errors,
        },
        expectedOracleOk: report.layers.L2.errors === 0,
        l2Findings: report.findings
          .filter((f) => f.layer === 'L2' && f.severity === 'error')
          .map((f) => `${f.path}: ${f.message.en}`),
      }),
    )
    .sort((a, b) => a.file.localeCompare(b.file));
  return { generatedBy, files };
}
