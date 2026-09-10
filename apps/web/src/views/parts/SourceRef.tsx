import type { Provenance } from '@passwerk/core';
import { type Language, t } from '../../i18n/index.ts';

export function SourceRef({ lang, source }: { lang: Language; source: Provenance[] }) {
  return (
    <span className="font-mono text-[12px] text-muted-foreground">
      {source.map((s, i) => (
        <span key={`${s.file}-${s.page ?? ''}-${s.cell ?? ''}`}>
          {i > 0 ? '; ' : ''}
          {s.file}
          {s.page !== undefined ? `, ${t(lang, 'review.page', { page: s.page })}` : ''}
          {s.cell !== undefined ? `, ${t(lang, 'review.cell', { cell: s.cell })}` : ''}
        </span>
      ))}
    </span>
  );
}
