import { Dialog as DialogPrimitive } from 'radix-ui';
import { type KeyboardEvent, type ReactNode, useContext } from 'react';
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
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowRight' && onNext) onNext();
    else if (e.key === 'ArrowLeft' && onPrev) onPrev();
    else return;
    e.preventDefault();
  };
  return (
    <DialogPrimitive.Root open={open} modal={false} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
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
