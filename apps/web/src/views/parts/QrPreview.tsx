import { Button } from '@/components/ui/button';
import { type Language, pick, t } from '../../i18n/index.ts';
import type { CarrierView } from '../../workflow/derive/carrier.ts';

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
  if (!carrier.ok) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="qr-none">
        {t(lang, 'qr.none', { reason: pick(lang, carrier.message) })}
      </p>
    );
  }
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(carrier.svg)}`;
  return (
    <div className="grid gap-2" data-testid="qr-preview">
      <img src={src} alt={t(lang, 'qr.title')} width={160} height={160} data-testid="qr-image" />
      <span className="text-muted-foreground text-xs">{t(lang, 'qr.payload')}</span>
      <code className="break-all text-xs" data-testid="qr-payload">
        {carrier.payload}
      </code>
      {onDownload && (
        <Button size="sm" variant="secondary" data-testid="qr-download" onClick={onDownload}>
          {t(lang, 'qr.download')}
        </Button>
      )}
    </div>
  );
}
