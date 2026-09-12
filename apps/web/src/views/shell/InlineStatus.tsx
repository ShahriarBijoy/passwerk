import type { ReactNode } from 'react';

const WORD = { ok: 'OK', error: 'ERROR', info: 'INFO' } as const;

/** The replacement for every toast (spec §9): `[ERROR] …` in mono label size, near its trigger. */
export function InlineStatus({
  kind,
  text,
  action,
  ...rest
}: {
  kind: keyof typeof WORD;
  text: string;
  action?: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <span
      role="status"
      data-kind={kind}
      className={[
        'label inline-flex items-center gap-2',
        kind === 'error' ? 'text-destructive' : '',
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
