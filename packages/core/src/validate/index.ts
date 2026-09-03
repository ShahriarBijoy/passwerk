import { canonicalJson } from '../emit/canonical.js';
import { buildEnvironment, environmentToJsonable } from '../emit/environment.js';
import type { EmitOptions } from '../emit/ids.js';
import { validateAas } from './aas.js';
import { buildReport, type Finding, type ValidationReport } from './finding.js';
import { validateSchema } from './schema.js';
import { validateTemplate } from './template.js';

export type ValidateOptions = EmitOptions;

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
  if (!l1.draft) return buildReport(l1.findings, { L1: true, L2: false, L3: false });

  const jsonable = environmentToJsonable(buildEnvironment(l1.draft, options));
  const rest = validateEnvironmentJson(jsonable);
  const report = buildReport([...l1.findings, ...rest.findings], { L1: true, L2: true, L3: true });
  return { ...report, aasJson: canonicalJson(jsonable) };
}
