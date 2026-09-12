import { createContext } from 'react';

/**
 * The instrument element: dialogs and popovers portal into `container`, never
 * `document.body`. `listContainer` is the list region's own wrapper (already `position:
 * relative`); the bottom sheet portals there instead, so it never covers the footer (spec §3.2).
 *
 * Lives in `lib`, not `views/shell`: `components/ui` (dialog, alert-dialog, popover, select)
 * reads it too, and `components` must not import `views` (fix wave item 18).
 */
export const InstrumentContext = createContext<{
  container: HTMLElement | null;
  listContainer: HTMLElement | null;
}>({
  container: null,
  listContainer: null,
});
