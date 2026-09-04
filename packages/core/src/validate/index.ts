import { canonicalJson } from '../emit/canonical.js';
import { buildEnvironment, environmentToJsonable } from '../emit/environment.js';
import type { EmitOptions } from '../emit/ids.js';
import { validateAas } from './aas.js';
import { buildReport, type Finding, type ValidationReport } from './finding.js';
import { validatePlausibility } from './plausibility.js';
import { validateSchema } from './schema.js';
import { validateTemplate } from './template.js';

export interface ValidateOptions extends EmitOptions {
  /** ISO date-time used as "now" by L4. Default: draft.meta.createdAt. */
  asOf?: string;
  /** Skip L4 (domain plausibility). Default false. */
  skipPlausibility?: boolean;
}

/** L2 + L3 on an environment that already exists as JSON. */
export function validateEnvironmentJson(jsonable: unknown): { findings: Finding[] } {
  const l2 = validateAas(jsonable);
  const l3 = validateTemplate(jsonable);
  return { findings: [...l2.findings, ...l3.findings] };
}

/**
 * L1 on the draft; if it is structurally sound, emit the AAS JSON in memory and run L2 and L3
 * on it. The verdict therefore always reflects the emitted output (BUILD_PLAN 2.4).
 */
export function validate(
  input: unknown,
  options: ValidateOptions = {},
): ValidationReport & { aasJson?: string } {
  const l1 = validateSchema(input);
  if (!l1.draft) return buildReport(l1.findings, { L1: true, L2: false, L3: false, L4: false });

  const jsonable = environmentToJsonable(buildEnvironment(l1.draft, options));
  const rest = validateEnvironmentJson(jsonable);
  const runL4 = options.skipPlausibility !== true;
  const l4 = runL4
    ? validatePlausibility(l1.draft, {
        ...(options.asOf !== undefined ? { asOf: options.asOf } : {}),
        l1Findings: l1.findings,
      }).findings
    : [];
  const report = buildReport([...l1.findings, ...rest.findings, ...l4], {
    L1: true,
    L2: true,
    L3: true,
    L4: runL4,
  });
  return { ...report, aasJson: canonicalJson(jsonable) };
}
