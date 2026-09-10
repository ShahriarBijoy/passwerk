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
      {`[${WORD[kind]}] ${text}`}
      {action}
    </span>
  );
}
