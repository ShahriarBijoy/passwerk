import { Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type Key, type Language, t, uploadContinueLabel } from '../i18n/index.ts';
import type { FileSummary } from '../workflow/state.ts';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { InlineStatus } from './shell/InlineStatus.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row } from './shell/Row.tsx';

export interface UploadViewProps {
  lang: Language;
  top: ReactNode;
  files: FileSummary[];
  busy: boolean;
  proposalCount: number;
  error?: string;
  onFiles(files: File[]): void;
  onRemove(name: string): void;
  onContinue(): void;
  children?: ReactNode;
}

const ACCEPT = '.pdf,.xlsx,.docx,.csv,.txt,application/pdf,text/csv,text/plain';

export function UploadView(props: UploadViewProps) {
  const { lang } = props;
  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber label={t(lang, 'hero.documents')} value={String(props.files.length)} />
          {props.files.length > 0 && (
            <span className="label pb-1.5">
              {t(lang, 'hero.proposals', { count: props.proposalCount })}
            </span>
          )}
        </>
      }
      toolbar={<span className="label">{t(lang, 'upload.hint')}</span>}
      footer={
        <>
          {props.busy && (
            <InlineStatus
              kind="info"
              text={t(lang, 'upload.busy')}
              data-testid="upload-busy"
              action={<Spinner />}
            />
          )}
          {props.error && !props.busy && (
            <InlineStatus kind="error" text={props.error} data-testid="upload-error" />
          )}
          <span className="flex-1" />
          <Button
            variant="primary"
            data-testid="continue"
            disabled={props.busy || props.files.every((f) => f.error)}
            onClick={props.onContinue}
          >
            {uploadContinueLabel(lang, props.proposalCount)} →
          </Button>
        </>
      }
    >
      <label
        className="my-2 flex h-24 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border-visible text-muted-foreground hover:border-display hover:text-foreground"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          props.onFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <Upload className="size-4" aria-hidden />
        <span className="label">{t(lang, 'upload.drop')}</span>
        <input
          className="sr-only"
          data-testid="file-input"
          type="file"
          multiple
          accept={ACCEPT}
          disabled={props.busy}
          onChange={(e) => {
            props.onFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </label>
      {props.files.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {t(lang, 'upload.empty')}
        </p>
      ) : (
        <div data-testid="file-table">
          {props.files.map((f) => (
            <Row
              key={f.name}
              name={f.name}
              {...(f.error
                ? {}
                : { value: String(f.pages), unit: t(lang, 'upload.col.pages').toLowerCase() })}
              tags={
                f.error
                  ? [{ label: t(lang, `upload.error.${f.error.code}` as Key), tone: 'accent' }]
                  : [{ label: f.format }, { label: f.lang, tone: 'dim' }]
              }
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t(lang, 'upload.remove')}
                  onClick={() => props.onRemove(f.name)}
                >
                  ✕
                </Button>
              }
              data-testid="file-row"
              data-file={f.name}
            >
              <span hidden data-testid="file-pages">
                {f.error ? '' : f.pages}
              </span>
            </Row>
          ))}
        </div>
      )}
      {props.children}
    </Instrument>
  );
}
