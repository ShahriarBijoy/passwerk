export function GroupHeader({
  name,
  count,
  open,
  onToggle,
  ...rest
}: {
  name: string;
  count: string;
  open: boolean;
  onToggle(): void;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex h-11 w-full items-center gap-3 border-t border-border text-left outline-none focus-visible:bg-surface"
      {...rest}
    >
      <span className="min-w-0 flex-1 truncate text-display">{name}</span>
      <span className="label">{count}</span>
      <span aria-hidden className="w-3 text-right text-disabled">
        {open ? '▾' : '›'}
      </span>
    </button>
  );
}
