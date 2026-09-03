import { PACKAGE_NAME } from '@passwerk/cli';
import { describe, expect, it } from 'vitest';

describe('@passwerk/cli', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@passwerk/cli');
  });
});
