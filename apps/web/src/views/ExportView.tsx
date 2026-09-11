import type { GapReport, ValidationReport } from '@passwerk/core';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { type Key, type LangText, type Language, pick, t, verdictKey } from '../i18n/index.ts';
import type { CarrierView } from '../workflow/derive/carrier.ts';
import type { ExportKind } from '../workflow/exports.ts';
import { QrPreview } from './parts/QrPreview.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { InlineStatus } from './shell/InlineStatus.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row } from './shell/Row.tsx';

export interface ExportViewProps {
  lang: Language;
  top: ReactNode;
  report: ValidationReport;
  gap: GapReport;
  carrier: CarrierView;
  exportError?: LangText;
  /** A footer-slot status line, forwarded to `Instrument` (storage, host or a caught failure). */
  notice?: ReactNode;
  onExport(kind: ExportKind): void;
  children?: ReactNode;
}

const FILES: { kind: Exclude<ExportKind, 'qr'>; note?: Key; primary: boolean }[] = [
  { kind: 'aasJson', note: 'export.aasJson.note', primary: true },
  { kind: 'aasx', primary: true },
  { kind: 'html', note: 'export.html.note', primary: false },
  { kind: 'gaps', note: 'export.gaps.note', primary: false },
  { kind: 'draft', note: 'export.draft.note', primary: false },
];

export function ExportView(props: ExportViewProps) {
  const { lang, report, gap } = props;
  return (
    <Instrument
      top={props.top}
      notice={props.notice}
      hero={
        <>
          <HeroNumber
            label={t(lang, 'hero.verdictCarried')}
            value={t(lang, verdictKey(report.verdict))}
            tone={report.verdict === 'invalid' ? 'accent' : 'display'}
            data-testid="verdict"
            data-verdict={report.verdict}
          />
          <span className="label pb-1.5">
            {t(lang, 'hero.findings', { count: report.findings.length })} ·{' '}
            {t(lang, 'hero.mandatoryShort', {
              present: gap.completeness.mandatory.present,
              total: gap.completeness.mandatory.total,
            })}
          </span>
        </>
      }
      footer={
        <span className="note" data-testid="not-legal-advice">
          {t(lang, 'app.notLegalAdvice')}
        </span>
      }
    >
      <div className="grid gap-6 py-2 sm:grid-cols-[1fr_200px]">
        <div>
          {FILES.map((f) => (
            <Row
              key={f.kind}
              name={
                <>
                  {t(lang, `export.${f.kind}` as Key)}
                  {f.note && <span className="text-muted-foreground"> · {t(lang, f.note)}</span>}
                </>
              }
              action={
                <Button
                  variant={f.primary ? 'primary' : 'secondary'}
                  size="sm"
                  data-testid={`export-${f.kind}`}
                  onClick={() => props.onExport(f.kind)}
                >
                  {t(lang, 'export.download')}
                </Button>
              }
            />
          ))}
          {props.exportError && (
            <div className="py-2">
              <InlineStatus
                kind="error"
                text={t(lang, 'export.failed', { reason: pick(lang, props.exportError) })}
                data-testid="export-error"
              />
            </div>
          )}
        </div>
        <div className="grid content-start gap-2 sm:border-l sm:border-border sm:pl-6">
          <span className="label">{t(lang, 'hero.carrier')}</span>
          <QrPreview lang={lang} carrier={props.carrier} onDownload={() => props.onExport('qr')} />
        </div>
      </div>
      {props.children}
    </Instrument>
  );
}
