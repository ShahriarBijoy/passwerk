declare global {
  interface Window {
    __passwerkClock?: string;
  }
}

/** The only place the wall clock is read. Playwright pins it through `window.__passwerkClock`. */
export function nowIso(): string {
  const pinned = typeof window !== 'undefined' ? window.__passwerkClock : undefined;
  return typeof pinned === 'string' ? pinned : new Date().toISOString();
}
