import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;
Element.prototype.scrollIntoView ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;
// jsdom does not implement matchMedia; the shell's theme code (platform.ts) reads it to follow
// the system preference when no theme has been chosen yet.
window.matchMedia ??= ((query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia;

// @testing-library/react's built-in auto-cleanup relies on a global `afterEach`, which this
// project's vitest config does not provide (`test.globals` is false). Register it explicitly
// so each `it()` starts from an empty document, regardless of how many prior tests mounted.
afterEach(() => {
  cleanup();
});

export function mount(el: ReactElement) {
  return render(el);
}
