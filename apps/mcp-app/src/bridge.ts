/**
 * The host adapter of the passwerk workbench (ADR D-037): seeds the web app's store from a
 * `review_passport` result, keeps the server's draft id in step with what the user sees, and
 * routes exports through the host. Written against {@link HostLink}, the slice of ext-apps'
 * `App` it needs, so tests can pass the real `App` or a fake.
 */
import { canonicalJson, type FactSet, type PassportDraft, validateSchema } from '@passwerk/core';
import type { Language } from '@/i18n/index.ts';
import { derive } from '@/workflow/derive/index.ts';
import type { ExportFile, ExportKind } from '@/workflow/exports.ts';
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
    ? `Dieser Host kann aus der Werkbank keine Dateien speichern. Bitten Sie den Assistenten, den Entwurf ${draftId ?? '(noch nicht synchronisiert)'} mit emit_passport zu exportieren.`
    : `This host cannot save files from the workbench. Ask the assistant to export draft ${draftId ?? '(not synced yet)'} with emit_passport.`;

const noGapFile = (lang: Language, draftId: string | undefined): string =>
  lang === 'de'
    ? `Der Lückenbericht wird hier nicht als Datei gespeichert. Bitten Sie den Assistenten, gap_report für den Entwurf ${draftId ?? '(noch nicht synchronisiert)'} auszuführen.`
    : `The gap report is not saved as a file here. Ask the assistant to run gap_report for draft ${draftId ?? '(not synced yet)'}.`;

const saved = (lang: Language, path: string): string =>
  lang === 'de' ? `Gespeichert unter ${path}.` : `Saved to ${path}.`;

const saveFailed = (lang: Language, name: string, reason: string): string =>
  lang === 'de'
    ? `${name} konnte nicht gespeichert werden: ${reason}`
    : `Could not save ${name}: ${reason}`;

/** The folder a local server lets the workbench save into, from a `review_passport` result. */
export function saveRootOf(structured: Record<string, unknown> | undefined): string | undefined {
  const save = structured?.['saveToFolder'];
  const root =
    typeof save === 'object' && save !== null ? (save as { root?: unknown }).root : undefined;
  return typeof root === 'string' ? root : undefined;
}

/** Subfolder of the save root the workbench writes into. */
export const EXPORT_DIR = 'passwerk-exports';

const EMIT_TARGET: Partial<Record<ExportKind, string>> = {
  aasJson: 'aas-json',
  aasx: 'aasx',
  html: 'html',
  draft: 'draft-json',
};

export interface DownloadRequest {
  file: ExportFile;
  kind: ExportKind;
  lang: Language;
  /** The id the sync last stored; named when the user has to ask the assistant. */
  draftId?: string;
  /** The draft the file was built from and its "now", which a local server emits again. */
  draft?: PassportDraft;
  asOf?: string;
  /** The folder a local server named in `saveToFolder`; absent for a remote server. */
  saveRoot?: string;
}

const writtenPath = (structured: Record<string, unknown> | undefined): string | undefined => {
  const files = structured?.['files'];
  const first = Array.isArray(files) ? (files[0] as { path?: unknown } | undefined) : undefined;
  const image = structured?.['image'] as { path?: unknown } | undefined;
  const path = first?.path ?? image?.path;
  return typeof path === 'string' ? path : undefined;
};

/**
 * Sandboxed iframes cannot start downloads themselves. A host that advertises `downloadFile`
 * gets the bytes. A host without it (the ChatGPT desktop app, ADR D-045) but with a local
 * server gets the file saved into that server's folder by the same tools the model would call:
 * `emit_passport`, or `generate_carrier` for the QR. Otherwise the user is told what to ask
 * the assistant, naming the draft id the sync last stored. Failures are shown, never dropped.
 */
export async function hostDownload(
  link: HostLink,
  req: DownloadRequest,
  notify: (text: string) => void,
): Promise<void> {
  const { file, kind, lang, draftId } = req;
  if (link.getHostCapabilities()?.downloadFile) {
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
    return;
  }
  if (req.saveRoot === undefined || req.draft === undefined) {
    notify(noDownload(lang, draftId));
    return;
  }
  if (kind === 'gaps') {
    notify(noGapFile(lang, draftId));
    return;
  }
  const call =
    kind === 'qr'
      ? {
          name: 'generate_carrier',
          arguments: { draft: req.draft, format: 'svg', outDir: EXPORT_DIR },
        }
      : {
          name: 'emit_passport',
          arguments: {
            draft: req.draft,
            targets: [EMIT_TARGET[kind]],
            outDir: EXPORT_DIR,
            htmlLang: lang,
            ...(req.asOf !== undefined ? { asOf: req.asOf } : {}),
          },
        };
  try {
    const r = await link.callServerTool(call);
    const path = r.isError ? undefined : writtenPath(r.structuredContent);
    if (path === undefined) {
      const reason = String(r.structuredContent?.['error'] ?? 'no file was written');
      notify(saveFailed(lang, file.name, reason));
      return;
    }
    notify(saved(lang, path));
  } catch (e) {
    notify(saveFailed(lang, file.name, e instanceof Error ? e.message : String(e)));
  }
}
