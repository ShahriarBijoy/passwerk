import { PACKAGE_NAME } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('apps/web wiring', () => {
  it('resolves @passwerk/core through the root alias', () => {
    expect(PACKAGE_NAME).toBe('@passwerk/core');
  });
});
