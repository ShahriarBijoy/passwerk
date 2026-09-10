import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { type Language, pick, t } from '../../i18n/index.ts';
import type { CarrierView } from '../../workflow/derive/carrier.ts';
import { InlineStatus } from '../shell/InlineStatus.tsx';

/** The QR as an image built from the SVG bytes (no innerHTML), its payload, or the reason there is none. */
export function QrPreview({
  lang,
  carrier,
  onDownload,
}: {
  lang: Language;
  carrier: CarrierView;
  onDownload?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!carrier.ok) {
    return (
      <p className="text-[13px] text-muted-foreground" data-testid="qr-none">
        {t(lang, 'qr.none', { reason: pick(lang, carrier.message) })}
      </p>
    );
  }
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(carrier.svg)}`;
  return (
    <div className="grid justify-items-start gap-2" data-testid="qr-preview">
      <img
        src={src}
        alt={t(lang, 'qr.title')}
        width={128}
        height={128}
        className="border-[6px] border-white bg-white"
        data-testid="qr-image"
      />
      <span className="label">{t(lang, 'qr.payload')}</span>
      <code
        className="break-all font-mono text-[12px] text-muted-foreground"
        data-testid="qr-payload"
      >
        {carrier.payload}
      </code>
      <span className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          data-testid="qr-copy"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(carrier.payload)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {t(lang, 'shell.copy')}
        </Button>
        {copied && <InlineStatus kind="ok" text={t(lang, 'shell.copied')} />}
        {onDownload && (
          <Button variant="ghost" size="sm" data-testid="qr-download" onClick={onDownload}>
            {t(lang, 'export.qr.formats')}
          </Button>
        )}
      </span>
    </div>
  );
}
