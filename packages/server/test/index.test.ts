import { PACKAGE_NAME } from '@passwerk/server';
import { describe, expect, it } from 'vitest';

describe('@passwerk/server', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@passwerk/server');
  });
});
