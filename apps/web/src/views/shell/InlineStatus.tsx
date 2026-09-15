import type { ReactNode } from 'react';

const WORD = { ok: 'OK', error: 'ERROR', info: 'INFO' } as const;

/** The replacement for every toast (spec §9): `[ERROR] …` in mono label size, near its trigger. */
export function InlineStatus({
  kind,
  text,
  action,
  emphasis = false,
  ...rest
}: {
  kind: keyof typeof WORD;
  text: string;
  action?: ReactNode;
  /**
   * A boxed, tinted line for a result the reviewer must not miss, such as where a host saved
   * a file (ADR D-045). Without it the status stays a plain label line.
   */
  emphasis?: boolean;
  'data-testid'?: string;
}) {
  return (
    <span
      role="status"
      data-kind={kind}
      data-emphasis={emphasis ? 'true' : undefined}
      className={[
        'label inline-flex items-center gap-2',
        kind === 'error' ? 'text-destructive' : '',
        emphasis ? 'rounded-sm border px-2 py-1' : '',
        emphasis && kind === 'ok' ? 'border-success/50 bg-success/10 text-success' : '',
        emphasis && kind === 'error' ? 'border-destructive/50 bg-destructive/10' : '',
        emphasis && kind === 'info' ? 'border-warning/50 bg-warning/10 text-foreground' : '',
      ].join(' ')}
      {...rest}
    >
      {/* The word is a label and shouts; the message is a sentence someone reads, so it keeps
          the label's mono 11 px (spec 5.1) without the upper case (spec 2). */}
      <span>
        {`[${WORD[kind]}] `}
        <span className="normal-case">{text}</span>
      </span>
      {action}
    </span>
  );
}
