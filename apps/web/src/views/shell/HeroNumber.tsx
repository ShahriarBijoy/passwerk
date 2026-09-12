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
    <div data-tone={tone} className="min-w-0" {...rest}>
      <div className="label">{label}</div>
      <div className="flex items-baseline gap-2">
        <span
          className={[
            'display truncate',
            // Doto never renders more than one word at the full 40 px (spec 4.2). A verdict
            // phrase - "Kein Pass erforderlich", "Gultig mit Warnungen" - drops to 26 px and
            // stays on one line rather than wrapping into a second row of dot matrix. 26 px, not
            // 28: at 28 px the longest German verdict needs 357 px and the obligation column at
            // 735 px offers 349, so it lost its last letters to the ellipsis. At 26 px the
            // longest string on either screen in either language is 332 px against 349 and 436,
            // so `truncate` is a guard that never fires rather than something a reader sees.
            /\s/.test(value) ? 'text-[26px] leading-tight' : 'text-[40px]',
            tone === 'accent' ? 'text-destructive' : '',
          ].join(' ')}
        >
          {value}
        </span>
        {unit && <span className="font-mono text-[22px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
