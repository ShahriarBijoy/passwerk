import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import {
  buildReport,
  type Finding,
  type ValidationReport,
  type Verdict,
} from '../validate/finding.js';
import { validateEnvironmentJson } from '../validate/index.js';
import { validateSchema } from '../validate/schema.js';
import { canonicalJson } from './canonical.js';
import { buildEnvironment, environmentToJsonable } from './environment.js';
import type { EmitOptions } from './ids.js';

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
 * verdict is recomputed from L1 + L2 + L3 on the emitted output.
 */
export function emitAasJson(input: unknown, options: EmitOptions = {}): EmitResult<string> {
  const l1 = validateSchema(input);
  if (!l1.draft) throw new PassportDraftError(l1.findings);
  const environment = buildEnvironment(l1.draft, options);
  const jsonable = environmentToJsonable(environment);
  const rest = validateEnvironmentJson(jsonable);
  const report = buildReport([...l1.findings, ...rest.findings], { L1: true, L2: true, L3: true });
  return {
    output: canonicalJson(jsonable),
    environment,
    verdict: report.verdict,
    findings: report.findings,
    report,
  };
}
