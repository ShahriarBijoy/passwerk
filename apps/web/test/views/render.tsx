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

// @testing-library/react's built-in auto-cleanup relies on a global `afterEach`, which this
// project's vitest config does not provide (`test.globals` is false). Register it explicitly
// so each `it()` starts from an empty document, regardless of how many prior tests mounted.
afterEach(() => {
  cleanup();
});

export function mount(el: ReactElement) {
  return render(el);
}
