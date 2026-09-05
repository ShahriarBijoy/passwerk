import type { Verdict } from '@passwerk/core';
import { Badge } from '@/components/ui/badge';
import { type Language, t, verdictKey } from '../../i18n/index.ts';

const VARIANT: Record<Verdict, 'default' | 'secondary' | 'destructive'> = {
  valid: 'default',
  valid_with_warnings: 'secondary',
  invalid: 'destructive',
};

export function VerdictChip({ lang, verdict }: { lang: Language; verdict: Verdict }) {
  return (
    <Badge variant={VARIANT[verdict]} data-testid="verdict" data-verdict={verdict}>
      {t(lang, verdictKey(verdict))}
    </Badge>
  );
}
