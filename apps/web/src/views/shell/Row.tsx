import type { KeyboardEvent, ReactNode } from 'react';

export type RowTag = {
  label: string;
  tone?: 'default' | 'dim' | 'success' | 'warning' | 'accent';
  testId?: string;
};

const TAG: Record<NonNullable<RowTag['tone']>, string> = {
  default: 'text-foreground',
  dim: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-destructive',
};
const DOT: Record<'ok' | 'bad' | 'missing' | 'none', string> = {
  ok: 'bg-success',
  bad: 'bg-destructive',
  missing: 'border border-disabled',
  none: 'invisible',
};

type DataAttrs = Record<`data-${string}`, string | undefined>;

/** One line per item (spec §5.1): 40 px, top divider, name truncates, detail waits behind `onOpen`. */
export function Row({
  name,
  value,
  unit,
  tags = [],
  dot,
  open = false,
  onOpen,
  action,
  indent = false,
  children,
  ...data
}: {
  name: ReactNode;
  value?: ReactNode;
  unit?: string;
  tags?: RowTag[];
  dot?: keyof typeof DOT;
  open?: boolean;
  onOpen?(): void;
  action?: ReactNode;
  indent?: boolean;
  children?: ReactNode;
} & DataAttrs) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      {...data}
      {...(onOpen ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown } : {})}
      data-open={open ? 'true' : undefined}
      className={[
        'flex min-h-10 items-center gap-3 border-t border-border py-2 text-sm outline-none',
        onOpen ? 'cursor-pointer hover:bg-surface focus-visible:bg-surface' : '',
        open ? '-mx-4 border-l-2 border-l-destructive bg-surface pr-4 pl-[14px]' : '',
        indent ? 'pl-5' : '',
      ].join(' ')}
    >
      {dot && (
        <span aria-hidden className={['size-1.5 shrink-0 rounded-pill', DOT[dot]].join(' ')} />
      )}
      <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
      {value !== undefined && <span className="font-mono text-display">{value}</span>}
      {unit && <span className="label">{unit}</span>}
      {tags.map((tg) => (
        <span
          key={tg.label}
          className={['label', TAG[tg.tone ?? 'default']].join(' ')}
          {...(tg.testId ? { 'data-testid': tg.testId } : {})}
        >
          {tg.label}
        </span>
      ))}
      {action}
      {onOpen && (
        <span aria-hidden className="w-3 text-right text-disabled">
          {open ? '▾' : '›'}
        </span>
      )}
      {children}
    </div>
  );
}
