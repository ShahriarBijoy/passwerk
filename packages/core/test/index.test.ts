import { PACKAGE_NAME } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('@passwerk/core', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@passwerk/core');
  });
});
