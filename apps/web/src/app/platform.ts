import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { AssistClient, AssistConfig, AssistProvider } from '../workflow/assist/types.ts';
import type { ExportFile } from '../workflow/exports.ts';
import { makeAssistClient } from './assist/client.ts';
import { clearAssistKey, loadAssistKey, saveAssistKey } from './assist/key.ts';
import { DEFAULT_MODELS, endpointLabel } from './assist/providers.ts';
import { downloadFile } from './download.ts';
import { clearState } from './persistence.ts';

/**
 * The bring-your-own-key assist as a host capability (ADR D-038). A shell that supplies none
 * has no assist at all and its UI does not render — which is how the MCP App keeps its
 * sovereignty proof unchanged without a line of its own: its host already has a model, so
 * calling a second one from inside the iframe would be duplicative.
 *
 * Every provider specific — the endpoints, the default model ids, the request envelopes —
 * sits behind this interface rather than being imported by the shared shell. Only
 * `browserPlatform` reaches `app/assist/providers.ts`, and the MCP App does not import
 * `browserPlatform`, so no endpoint string survives into its bundle.
 */
export interface AssistPlatform {
  client(config: AssistConfig): AssistClient;
  /** The provider's default model id, so the shell needs no provider knowledge of its own. */
  defaultModel(provider: AssistProvider): string;
  /** The host a run would reach, for the disclosure panel. Display only. */
  endpointLabel(config: AssistConfig): string;
  /** The key remembered on this device, if the reviewer asked for that. */
  loadKey(): Promise<string | undefined>;
  saveKey(key: string): Promise<void>;
  clearKey(): Promise<void>;
}

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
  /** Absent means no assist: the panel does not render and no endpoint is bundled. */
  assist?: AssistPlatform;
}

export const browserPlatform: Platform = {
  download: downloadFile,
  clearPersisted: () => void clearState(),
  pdfWorkerSrc: pdfWorkerUrl,
  assist: {
    client: (config) => makeAssistClient(config),
    defaultModel: (provider) => DEFAULT_MODELS[provider],
    endpointLabel,
    loadKey: loadAssistKey,
    saveKey: saveAssistKey,
    clearKey: clearAssistKey,
  },
};
