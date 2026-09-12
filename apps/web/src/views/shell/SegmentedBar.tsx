/** Discrete 2 px-gapped blocks, square ends (spec §5.1). Bar = proportion; the number beside it = precision. */
export function SegmentedBar({
  filled,
  total,
  tone = 'display',
  size = 'standard',
  segments = 36,
}: {
  filled: number;
  total: number;
  tone?: 'display' | 'accent' | 'success';
  size?: 'standard' | 'compact';
  segments?: number;
}) {
  const on = total > 0 ? Math.floor((Math.min(filled, total) / total) * segments) : 0;
  const fill =
    tone === 'accent' ? 'bg-destructive' : tone === 'success' ? 'bg-success' : 'bg-display';
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      className={['flex w-full gap-[2px]', size === 'compact' ? 'h-1.5' : 'h-2'].join(' ')}
    >
      {Array.from({ length: segments }, (_, i) => (
        <i
          key={String(i)}
          data-filled={i < on ? 'true' : 'false'}
          className={['flex-1', i < on ? fill : 'bg-border'].join(' ')}
        />
      ))}
    </div>
  );
}
