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
  sheet,
  children,
  ...rest
}: {
  top: ReactNode;
  hero?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  sheet?: ReactNode;
  children: ReactNode;
  'data-testid'?: string;
}) {
  // A callback ref into state (not an effect): the container is known after the first commit
  // and portals re-render once it is.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <InstrumentContext.Provider value={{ container }}>
      <div
        ref={setContainer}
        className="relative mx-auto grid w-full max-w-[1024px] grid-rows-[auto_auto_auto_1fr_auto] overflow-hidden bg-background text-foreground"
        style={{ height: 'var(--instrument-height)' }}
        {...rest}
      >
        <div data-region="top" className="flex h-11 items-center gap-4 border-b border-border px-4">
          {top}
        </div>
        <div data-region="hero" className="flex min-h-[72px] items-end gap-4 px-4 pt-3 pb-2">
          {hero}
        </div>
        <div data-region="toolbar" className="flex h-9 items-center gap-4 px-4">
          {toolbar}
        </div>
        <div className="relative min-h-0">
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
          <div data-region="sheet" className="contents">
            {sheet}
          </div>
        </div>
        <div
          data-region="footer"
          className="flex h-13 items-center gap-3 border-t border-border px-4"
        >
          {footer}
        </div>
      </div>
    </InstrumentContext.Provider>
  );
}
