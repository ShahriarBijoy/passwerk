import type { Finding, ValidationReport, Verdict } from '../validate/finding.js';
import { assembleReport, type ValidateOptions } from '../validate/index.js';
import { validateSchema } from '../validate/schema.js';
import type * as aas from '../vendor/aasCore.js';
import { canonicalJson } from './canonical.js';
import { buildEnvironment, environmentToJsonable } from './environment.js';

export interface EmitResult<T> {
  output: T;
  environment: aas.types.Environment;
  verdict: Verdict;
  findings: Finding[];
  report: ValidationReport;
}

/** Thrown when the input is not even structurally a PassportDraft, so nothing can be emitted. */
export class PassportDraftError extends Error {
  readonly findings: Finding[];
  constructor(findings: Finding[]) {
    super(`PassportDraft is structurally invalid: ${findings.map((f) => f.message.en).join('; ')}`);
    this.name = 'PassportDraftError';
    this.findings = findings;
  }
}

/**
 * Canonical AAS JSON for the draft. Fail-honest: value-level L1 errors still emit, and the
 * verdict is the full L1 + L2 + L3 + L4 report on the emitted output, assembled by the same
 * `assembleReport` that `validate` uses (issue #12), so a draft never exports `valid` while
 * validating `invalid`.
 */
export function emitAasJson(input: unknown, options: ValidateOptions = {}): EmitResult<string> {
  const l1 = validateSchema(input);
  if (!l1.draft) throw new PassportDraftError(l1.findings);
  const environment = buildEnvironment(l1.draft, options);
  const jsonable = environmentToJsonable(environment);
  const report = assembleReport({ ...l1, draft: l1.draft }, jsonable, options);
  return {
    output: canonicalJson(jsonable),
    environment,
    verdict: report.verdict,
    findings: report.findings,
    report,
  };
}
