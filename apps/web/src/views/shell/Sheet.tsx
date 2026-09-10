import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from 'react';
import { Kbd } from '@/components/ui/kbd';
import { type Language, t } from '../../i18n/index.ts';
import { InstrumentContext } from './context.ts';

/**
 * The bottom sheet (spec §3.2): non-modal so the list stays clickable, portaled into the
 * instrument, max 45 % of its height. `Esc` closes, `←` / `→` move within the current list.
 */
export function Sheet({
  lang,
  open,
  title,
  meta,
  position,
  onPrev,
  onNext,
  onClose,
  actions,
  children,
  ...rest
}: {
  lang: Language;
  open: boolean;
  title: string;
  meta?: ReactNode;
  position?: { index: number; total: number };
  onPrev?(): void;
  onNext?(): void;
  onClose(): void;
  actions?: ReactNode;
  children: ReactNode;
  'data-testid'?: string;
}) {
  const { container } = useContext(InstrumentContext);
  // `←` / `→` stay on the content's own bubbled keydown; they only ever matter while focus is
  // still inside the sheet (an input's own left/right editing is excluded below), so there is no
  // equivalent gap to close for them.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowRight' && onNext) onNext();
    else if (e.key === 'ArrowLeft' && onPrev) onPrev();
    else return;
    e.preventDefault();
  };
  // The latest `onClose`, read from the document-level listener below (a ref, not a dependency,
  // so the listener below is attached exactly once per mount rather than re-attached on every
  // render a caller passes a new closure).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // `Escape` closes the sheet from anywhere in the document, not only when focus is still inside
  // its own content: a nested re-render (an in-sheet edit toggle) or a nested modal dialog
  // closing can both move focus to `<body>`, which is not a descendant of this Content node, so
  // a keydown handler attached there (as this one used to be) never sees the key in that case -
  // see the fix-round-1 report. A React 19 callback ref with a cleanup function, this project's
  // sanctioned alternative to an effect (Instrument's own container ref), attaches the listener
  // once the content mounts and detaches it when the sheet unmounts. It skips Escape when a real
  // modal dialog (the row editor, the add-value dialog, a confirm) is open above the sheet, so
  // that dialog's own Escape handling - not this one - gets to close it first.
  const escapeRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const doc = el.ownerDocument;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A modal dialog stacked above the sheet owns Escape.
      if (
        doc.querySelector(
          '[data-slot="dialog-content"][data-state="open"], [data-slot="alert-dialog-content"][data-state="open"]',
        )
      )
        return;
      e.preventDefault();
      closeRef.current();
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, []);
  return (
    <DialogPrimitive.Root open={open} modal={false} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Content
          ref={escapeRef}
          onKeyDown={onKeyDown}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="absolute inset-x-0 bottom-0 z-40 grid max-h-[45%] grid-rows-[auto_auto_1fr_auto] border-t border-border-visible bg-surface px-4 pt-2 pb-3 outline-none data-open:animate-in data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:slide-out-to-bottom-4 duration-200"
          {...rest}
        >
          <div aria-hidden className="mx-auto mb-2 h-0.5 w-8 bg-border-visible" />
          <div className="flex items-baseline gap-3">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate font-sans text-base font-medium text-display">
              {title}
            </DialogPrimitive.Title>
            {meta && (
              <DialogPrimitive.Description className="label truncate">
                {meta}
              </DialogPrimitive.Description>
            )}
            <DialogPrimitive.Close
              aria-label={t(lang, 'shell.close')}
              className="label hover:text-foreground"
              data-testid="sheet-close"
            >
              [ ✕ ]
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-y-auto py-2 text-[13px] text-muted-foreground">
            {children}
          </div>
          <div className="flex items-center gap-2 pt-1">
            {actions}
            <span className="flex-1" />
            {position && (
              <span className="label flex items-center gap-2">
                {onPrev && (
                  <button
                    type="button"
                    onClick={onPrev}
                    className="hover:text-foreground"
                    aria-label={t(lang, 'shell.prev')}
                  >
                    ‹ <Kbd>←</Kbd>
                  </button>
                )}
                {t(lang, 'shell.of', { n: position.index, total: position.total })}
                {onNext && (
                  <button
                    type="button"
                    onClick={onNext}
                    className="hover:text-foreground"
                    aria-label={t(lang, 'shell.next')}
                  >
                    <Kbd>→</Kbd> ›
                  </button>
                )}
              </span>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
