/**
 * The host adapter of the passwerk workbench (ADR D-037): seeds the web app's store from a
 * `review_passport` result, keeps the server's draft id in step with what the user sees, and
 * routes exports through the host. Written against {@link HostLink}, the slice of ext-apps'
 * `App` it needs, so tests can pass the real `App` or a fake.
 */
import { canonicalJson, type FactSet, validateSchema } from '@passwerk/core';
import { toast } from 'sonner';
import type { Language } from '@/i18n/index.ts';
import { derive } from '@/workflow/derive/index.ts';
import type { ExportFile } from '@/workflow/exports.ts';
import type { Action } from '@/workflow/reducer.ts';
import type { FileSummary } from '@/workflow/state.ts';
import type { Store } from '@/workflow/store.ts';
import { languageOf } from './host.ts';

export { applyTheme, languageOf, workerUrlOf } from './host.ts';

export interface HostLink {
  callServerTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
    structuredContent?: Record<string, unknown> | undefined;
    isError?: boolean | undefined;
  }>;
  updateModelContext(params: {
    content?: { type: 'text'; text: string }[];
    structuredContent?: Record<string, unknown>;
  }): Promise<unknown>;
  downloadFile(params: {
    contents: {
      type: 'resource';
      resource: { uri: string; mimeType: string; blob: string };
    }[];
  }): Promise<unknown>;
  getHostCapabilities(): { downloadFile?: object; updateModelContext?: object } | undefined;
}

const summariesOf = (facts: FactSet): FileSummary[] =>
  facts.documents.map((d) => ({
    name: d.name,
    size: 0,
    sha256: d.sha256,
    format: d.format,
    pages: d.pages,
    lang: d.lang,
    ...(d.error ? { error: d.error } : {}),
  }));

const isFactSet = (v: unknown): v is FactSet =>
  typeof v === 'object' && v !== null && Array.isArray((v as { facts?: unknown }).facts);

/**
 * Reducer actions that put a `review_passport` result on screen. The tool input is ignored:
 * it is a reference, the result carries the data. A draft that is not a `PassportDraft` is
 * dropped silently; the workbench then opens on the project screen.
 */
export function seedActions(
  structured: Record<string, unknown> | undefined,
  locale: string | undefined,
  at: string,
): Action[] {
  const actions: Action[] = [{ type: 'setLanguage', language: languageOf(locale), at }];
  const draft =
    structured?.['draft'] !== undefined ? validateSchema(structured['draft']).draft : undefined;
  const facts = isFactSet(structured?.['facts']) ? structured['facts'] : undefined;
  if (draft) actions.push({ type: 'importDraft', draft, at });
  if (facts) actions.push({ type: 'filesIngested', summaries: summariesOf(facts), facts, at });
  if (draft) actions.push({ type: 'goTo', step: 'review', at });
  return actions;
}

export interface SyncState {
  /** The id the server holds for the draft the user currently sees. */
  draftId?: string;
  error?: string;
}

const contextText = (
  lang: Language,
  verdict: string,
  percent: string,
  open: number,
  draftId: string,
): string =>
  lang === 'de'
    ? `passwerk-Werkbank: Ergebnis ${verdict}, Pflichtdaten ${percent} %, ${open} offene Pflichtangaben. Aktueller Entwurf: ${draftId}.`
    : `passwerk workbench: verdict ${verdict}, mandatory data ${percent} %, ${open} open required gaps. Current draft: ${draftId}.`;

/**
 * After every store change, debounced, stores the derived draft on the server through
 * `validate_passport` and tells the model its id. Same draft, same id, no second round trip.
 * Failures are reported through `onState` and retried on the next change; nothing throws
 * into the UI.
 */
export function attachSync(
  link: HostLink,
  store: Store,
  opts: { asOf: () => string; debounceMs: number; onState?: (s: SyncState) => void },
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastJson: string | undefined;
  let inFlight = false;
  let dirty = false;

  const run = async (): Promise<void> => {
    if (inFlight) {
      dirty = true;
      return;
    }
    const state = store.getState();
    const d = derive(state, opts.asOf());
    if (!d) return;
    const json = canonicalJson(d.draft);
    if (json === lastJson) return;
    inFlight = true;
    try {
      const r = await link.callServerTool({
        name: 'validate_passport',
        arguments: { draft: d.draft },
      });
      const draftId = r.structuredContent?.['draftId'];
      if (r.isError || typeof draftId !== 'string') {
        opts.onState?.({
          error: String(r.structuredContent?.['error'] ?? 'validate_passport failed'),
        });
        return;
      }
      lastJson = json;
      opts.onState?.({ draftId });
      if (link.getHostCapabilities()?.updateModelContext) {
        const open = d.gap.items.filter(
          (i) => i.bucket === 'required' && i.status !== 'present',
        ).length;
        const percent = d.gap.completeness.mandatory.percent;
        await link.updateModelContext({
          content: [
            {
              type: 'text',
              text: contextText(state.language, d.report.verdict, percent, open, draftId),
            },
          ],
          structuredContent: { draftId, verdict: d.report.verdict, mandatoryCompleteness: percent },
        });
      }
    } catch (e) {
      opts.onState?.({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      inFlight = false;
      if (dirty) {
        dirty = false;
        void run();
      }
    }
  };

  const unsubscribe = store.subscribe(() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void run(), opts.debounceMs);
  });
  return () => {
    unsubscribe();
    if (timer !== undefined) clearTimeout(timer);
  };
}

function base64Of(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

const noDownload = (lang: Language, draftId: string | undefined): string =>
  lang === 'de'
    ? `Dieser Host kann keine Dateien speichern. Bitten Sie Claude, emit_passport für den Entwurf ${draftId ?? '(noch nicht synchronisiert)'} mit einem outDir auszuführen.`
    : `This host cannot save files. Ask Claude to run emit_passport for draft ${draftId ?? '(not synced yet)'} with an outDir.`;

/**
 * Sandboxed iframes cannot start downloads themselves. When the host advertises
 * `downloadFile`, the export goes through it; otherwise the user is told how to get the file
 * from the model, naming the draft id the sync last stored.
 */
export async function hostDownload(
  link: HostLink,
  file: ExportFile,
  lang: Language,
  draftId: string | undefined,
  notify: (text: string) => void = (text) => void toast(text),
): Promise<void> {
  if (!link.getHostCapabilities()?.downloadFile) {
    notify(noDownload(lang, draftId));
    return;
  }
  await link.downloadFile({
    contents: [
      {
        type: 'resource',
        resource: {
          uri: `passwerk://export/${file.name}`,
          mimeType: file.type,
          blob: base64Of(file.bytes),
        },
      },
    ],
  });
}
