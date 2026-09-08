import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ExportFile } from '../workflow/exports.ts';
import { downloadFile } from './download.ts';
import { clearState } from './persistence.ts';

/**
 * Everything the shell needs from its host environment. The web app passes the browser
 * implementation; the MCP App (`apps/mcp-app`) passes one that talks to the host over the MCP
 * Apps bridge and never touches IndexedDB (ADR D-037).
 */
export interface Platform {
  download(file: ExportFile): void;
  /** Called on "start over"; the web app clears IndexedDB, the MCP App does nothing. */
  clearPersisted(): void;
  /** pdf.js worker URL; core's PDF reader needs one outside Node. */
  pdfWorkerSrc?: string;
}

export const browserPlatform: Platform = {
  download: downloadFile,
  clearPersisted: () => void clearState(),
  pdfWorkerSrc: pdfWorkerUrl,
};
