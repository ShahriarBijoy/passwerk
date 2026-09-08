import type { Language } from '@/i18n/index.ts';

/** The host's BCP 47 locale picks the chrome language: any German variant is `de`, else `en`. */
export function languageOf(locale: string | undefined): Language {
  return locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** The web app's Tailwind dark variant is `.dark` on an ancestor; the host tells us the theme. */
export function applyTheme(
  theme: string | undefined,
  root: HTMLElement = document.documentElement,
): void {
  root.classList.toggle('dark', theme === 'dark');
}
