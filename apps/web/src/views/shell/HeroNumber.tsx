export function HeroNumber({
  label,
  value,
  unit,
  tone = 'display',
  ...rest
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'display' | 'accent';
  'data-testid'?: string;
  'data-verdict'?: string;
}) {
  return (
    <div data-tone={tone} {...rest}>
      <div className="label">{label}</div>
      <div className="flex items-baseline gap-2">
        <span
          className={['display text-[40px]', tone === 'accent' ? 'text-destructive' : ''].join(' ')}
        >
          {value}
        </span>
        {unit && <span className="font-mono text-[22px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
