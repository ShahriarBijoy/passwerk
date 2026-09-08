import type { Language } from '@/i18n/index.ts';

/** The host's BCP 47 locale picks the chrome language: any German variant is `de`, else `en`. */
export function languageOf(locale: string | undefined): Language {
  return locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/**
 * pdf.js needs a worker script URL. The single-file build inlines the worker as a `data:` URL,
 * which Claude's sandbox refuses as a Worker source while `blob:` URLs work (measured in Claude
 * Desktop on 2026-09-08, ADR D-037). The bytes are re-wrapped as a Blob; any other URL passes
 * through unchanged.
 */
export function workerUrlOf(
  url: string,
  createObjectURL: (blob: Blob) => string = (b) => URL.createObjectURL(b),
): string {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(url);
  if (!m) return url;
  const [, mime, isBase64, payload] = m;
  const bytes = isBase64
    ? Uint8Array.from(atob(payload ?? ''), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload ?? ''));
  return createObjectURL(new Blob([bytes], { type: mime || 'text/javascript' }));
}

/** The web app's Tailwind dark variant is `.dark` on an ancestor; the host tells us the theme. */
export function applyTheme(
  theme: string | undefined,
  root: HTMLElement = document.documentElement,
): void {
  root.classList.toggle('dark', theme === 'dark');
}
