import { type LangText, type Language, pick } from '../../i18n/index.ts';

export function LangSpan({
  lang,
  text,
  className,
}: {
  lang: Language;
  text: LangText;
  className?: string;
}) {
  return <span className={className}>{pick(lang, text)}</span>;
}
