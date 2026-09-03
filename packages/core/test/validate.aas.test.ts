import {
  buildEnvironment,
  environmentToJsonable,
  PassportDraft,
  samples,
  validateAas,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('L2 validateAas', () => {
  const jsonable = environmentToJsonable(
    buildEnvironment(PassportDraft.parse(samples['ev-valid'])),
  );
  it('accepts the emitted environment', () => {
    const r = validateAas(jsonable);
    expect(r.findings).toEqual([]);
    expect(r.environment).toBeDefined();
  });
  it('reports deserialisation problems as PW-L2-DESERIALIZE', () => {
    const r = validateAas({ submodels: [{ modelType: 'Submodel' }] });
    expect(r.findings.map((f) => f.ruleId)).toEqual(['PW-L2-DESERIALIZE']);
    expect(r.findings[0]?.severity).toBe('error');
  });
  it('reports metamodel violations as PW-L2-AAS-CORE with a path', () => {
    const broken = structuredClone(jsonable) as unknown as {
      submodels: { submodelElements: { idShort: string }[] }[];
    };
    const first = broken.submodels[0]?.submodelElements[0];
    if (first) first.idShort = 'not-valid-id-short';
    const r = validateAas(broken);
    expect(r.findings.map((f) => f.ruleId)).toEqual(['PW-L2-AAS-CORE']);
    expect(r.findings[0]?.path).toContain('submodels[0].submodelElements[0]');
    expect(r.findings[0]?.message.de).toMatch(/AAS-Metamodell/);
  });
});
