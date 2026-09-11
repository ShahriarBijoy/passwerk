/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserPlatform } from '@/app/platform.ts';

describe('browserPlatform.theme', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('reflects the DOM once set() has run, even when localStorage.setItem throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    try {
      const theme = browserPlatform.theme;
      if (!theme) throw new Error('expected a theme capability');
      theme.set('dark');
      // Before this fix, `current()` always re-read storage (falling back to the system
      // preference when it threw), which could disagree with the toggle that just ran.
      expect(theme.current()).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      theme.set('light');
      expect(theme.current()).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
