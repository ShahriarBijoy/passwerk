export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span
      className={[
        'label',
        value >= 0.7 ? 'text-foreground' : value >= 0.4 ? '' : 'text-disabled',
      ].join(' ')}
      data-testid="confidence"
    >
      {pct} %
    </span>
  );
}
