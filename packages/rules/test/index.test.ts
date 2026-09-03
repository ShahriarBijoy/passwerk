import { PACKAGE_NAME } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('@passwerk/rules', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@passwerk/rules');
  });
});
