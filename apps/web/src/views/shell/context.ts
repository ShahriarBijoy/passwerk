import { createContext } from 'react';

/** The instrument element: portals (sheet, dialogs) mount inside it, never on document.body. */
export const InstrumentContext = createContext<{ container: HTMLElement | null }>({
  container: null,
});
