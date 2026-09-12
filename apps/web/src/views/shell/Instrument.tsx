import { type ReactNode, useState } from 'react';
import { InstrumentContext } from './context.ts';

/**
 * The fixed-height frame every step renders in (spec §3): top bar, hero strip, toolbar, the
 * one scrolling list region, footer, and the sheet overlaying the list. The frame's height is
 * `--instrument-height`, so the document never grows with content.
 */
export function Instrument({
  top,
  hero,
  toolbar,
  footer,
  notice,
  sheet,
  children,
  ...rest
}: {
  top: ReactNode;
  hero?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** A footer-slot status line (storage, host or a caught failure), rendered before `footer`'s
   *  other children so it never competes with the primary button for the same row's width. */
  notice?: ReactNode;
  sheet?: ReactNode;
  children: ReactNode;
  'data-testid'?: string;
}) {
  // Callback refs into state (not effects): each container is known after the first commit and
  // portals re-render once it is.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  // The list wrapper (already `position: relative`), not the scrolling list itself: the sheet
  // portals here so its `max-h-[45%]` and `absolute inset-x-0 bottom-0` are measured against the
  // list region alone, leaving the footer's primary button reachable while a sheet is open.
  // Clip the translated entrance/exit animation too, so it cannot intercept footer clicks.
  const [listContainer, setListContainer] = useState<HTMLElement | null>(null);
  return (
    <InstrumentContext.Provider value={{ container, listContainer }}>
      <div
        ref={setContainer}
        className="relative mx-auto grid w-full max-w-[1024px] grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_auto_1fr_auto] overflow-hidden bg-background text-foreground"
        style={{ height: 'var(--instrument-height)' }}
        {...rest}
      >
        <div
          data-region="top"
          className="flex h-11 min-w-0 items-center gap-4 border-b border-border px-4"
        >
          {top}
        </div>
        <div
          data-region="hero"
          className="flex min-h-[72px] min-w-0 items-end gap-4 px-4 pt-3 pb-2"
        >
          {hero}
        </div>
        {/* `gap-6` against a toggle group's own `gap-4`: with the pills gone, two groups side by
            side would otherwise read as one long row of words. */}
        <div data-region="toolbar" className="flex h-9 min-w-0 items-center gap-6 px-4">
          {toolbar}
        </div>
        <div ref={setListContainer} className="relative min-h-0 min-w-0 overflow-hidden">
          <div
            data-region="list"
            className="h-full overflow-y-auto overscroll-contain px-4 [scrollbar-color:var(--border-visible)_transparent] [scrollbar-width:thin]"
          >
            {children}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent"
          />
          {sheet}
        </div>
        <div
          data-region="footer"
          className="flex h-13 min-w-0 items-center gap-3 border-t border-border px-4"
        >
          {notice}
          {footer}
        </div>
      </div>
    </InstrumentContext.Provider>
  );
}
