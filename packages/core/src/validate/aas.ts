import * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { Finding } from './finding.js';
import { message } from './messages.js';

export interface AasResult {
  findings: Finding[];
  environment?: aas.types.Environment;
}

/** L2: the emitted JSON is a valid AAS V3.0 Environment according to aas-core verification. */
export function validateAas(jsonable: unknown): AasResult {
  const parsed = aas.jsonization.environmentFromJsonable(jsonable as aas.jsonization.JsonValue);
  if (parsed.error !== null || parsed.value === null) {
    const path = parsed.error?.path.toString() ?? '';
    const detail = parsed.error ? `${path}: ${parsed.error.message}` : 'unknown error';
    return {
      findings: [
        {
          layer: 'L2',
          ruleId: 'PW-L2-DESERIALIZE',
          severity: 'error',
          path,
          message: message('PW-L2-DESERIALIZE', detail),
        },
      ],
    };
  }
  const environment = parsed.value;
  const findings: Finding[] = [];
  for (const error of aas.verification.verify(environment)) {
    const path = error.path.toString();
    findings.push({
      layer: 'L2',
      ruleId: 'PW-L2-AAS-CORE',
      severity: 'error',
      path,
      message: message('PW-L2-AAS-CORE', `${path}: ${error.message}`),
    });
  }
  return { findings, environment };
}
