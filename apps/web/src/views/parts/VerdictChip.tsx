import type { Verdict } from '@passwerk/core';
import { type Language, t, verdictKey } from '../../i18n/index.ts';

export function VerdictChip({ lang, verdict }: { lang: Language; verdict: Verdict }) {
  return (
    <span
      className={[
        'label',
        verdict === 'invalid'
          ? 'text-destructive'
          : verdict === 'valid'
            ? 'text-success'
            : 'text-warning',
      ].join(' ')}
      data-testid="verdict"
      data-verdict={verdict}
    >
      {t(lang, verdictKey(verdict))}
    </span>
  );
}
