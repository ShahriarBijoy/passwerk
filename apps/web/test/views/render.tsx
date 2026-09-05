import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;
Element.prototype.scrollIntoView ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;

export function mount(el: ReactElement) {
  return render(el);
}
