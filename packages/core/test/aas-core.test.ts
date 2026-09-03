import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { getTemplate } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('@aas-core-works/aas-core3.0-typescript', () => {
  it('deserialises the bundled nameplate template and verifies it', () => {
    const env = aas.jsonization.environmentFromJsonable(
      getTemplate(1)?.environment as aas.jsonization.JsonValue,
    );
    expect(env.error).toBeNull();
    const errors = [...aas.verification.verify(env.mustValue())];
    // Templates legitimately violate AASd-120 (idShort on list children). Nothing else.
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) expect(e.message).toContain('AASd-120');
  });
});
