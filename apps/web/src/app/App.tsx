import type { Fact } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { Maximize2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { type LangText, type Language, pick, t } from '../i18n/index.ts';
import { AddValueDialog } from '../views/AddValueDialog.tsx';
import { AssistPanel } from '../views/AssistPanel.tsx';
import { ExportView } from '../views/ExportView.tsx';
import { FactsView } from '../views/FactsView.tsx';
import { GapsView } from '../views/GapsView.tsx';
import { ProjectView } from '../views/ProjectView.tsx';
import { ReviewView } from '../views/ReviewView.tsx';
import { arrayEntries, buildGroups, currentRows, manualEntries } from '../views/reviewModel.ts';
import { InlineStatus } from '../views/shell/InlineStatus.tsx';
import { Stepper } from '../views/shell/Stepper.tsx';
import { UploadView } from '../views/UploadView.tsx';
import { type SuggestionPrefill, suggestionPrefill } from '../workflow/assist/accept.ts';
import { buildRequest } from '../workflow/assist/request.ts';
import { runAssist } from '../workflow/assist/run.ts';
import type { AssistConfig, AssistSuggestion } from '../workflow/assist/types.ts';
import { type Derived, derive } from '../workflow/derive/index.ts';
import { deriveProject } from '../workflow/derive/project.ts';
import { importDraftJson } from '../workflow/draftIo.ts';
import { buildExports, type ExportKind } from '../workflow/exports.ts';
import { factStatuses } from '../workflow/factsModel.ts';
import { ingestFiles } from '../workflow/ingest.ts';
import { defaultProject, type Project } from '../workflow/project.ts';
import {
  type Decision,
  type DecisionKey,
  STEPS,
  type Step,
  type WorkflowState,
} from '../workflow/state.ts';
import type { Store } from '../workflow/store.ts';
import { nowIso } from './clock.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import type { Platform } from './platform.ts';
import { useStore } from './useStore.ts';

export interface AppProps {
  store: Store;
  /** Download, persistence and pdf.js worker of the host environment (browser or MCP App). */
  platform: Platform;
  storageNotice?: 'unavailable' | 'version';
  /** A key remembered on this device, read before mount so no effect has to fetch it. */
  initialAssistKey?: string;
  /** Where a host-level message lands when no screen owns it (the MCP app's "ask Claude to run emit_passport"). */
  hostNotice?: string;
}

type ShellStatus = { kind: 'error' | 'info'; text: string } | null;

let idCounter = 0;

/** `crypto.randomUUID` when available, otherwise a non-clock, non-crypto fallback. */
function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `${Math.random().toString(36).slice(2)}-${idCounter}`;
}

/**
 * Owns the project screen's local draft state: the placeholder draft URN generated at mount
 * and the in-progress project shown before "Create project" commits it to `state.project`.
 * Keyed on `state.generation` by the caller so that a reset or an imported draft (both bump
 * the generation) remounts this component and re-seeds a fresh URN and an empty project,
 * instead of reusing the previous battery's identifier.
 */
function ProjectStep({
  lang,
  state,
  asOf,
  derived,
  dispatch,
  goTo,
  top,
  notice,
  onImport,
  onReset,
}: {
  lang: Language;
  state: WorkflowState;
  asOf: string;
  derived: Derived | null;
  dispatch: Store['dispatch'];
  goTo(step: Step): void;
  top: ReactNode;
  notice?: ReactNode;
  onImport(text: string): { ok: true } | { ok: false; message: LangText };
  onReset(): void;
}) {
  const [draftUrn] = useState(() => `urn:passwerk:draft:${randomId()}`);
  const [localProject, setLocalProject] = useState(() => defaultProject(draftUrn, ''));
  const project = state.project ?? localProject;
  const projectDerived = deriveProject(project, asOf);
  const onChange = (p: Project) => {
    if (state.project) dispatch({ type: 'setProject', project: p, at: nowIso() });
    else setLocalProject(p);
  };
  const onContinue = () => {
    if (!state.project) dispatch({ type: 'setProject', project: localProject, at: nowIso() });
    goTo('upload');
  };

  return (
    <ProjectView
      lang={lang}
      project={project}
      derived={projectDerived}
      isNew={state.project === null}
      draftUrn={draftUrn}
      top={top}
      notice={notice}
      {...(state.project
        ? { resume: { files: state.files.map((f) => f.name), updatedAt: state.updatedAt } }
        : {})}
      onChange={onChange}
      onContinue={onContinue}
      onImport={onImport}
      onResume={() => {
        const step = derived === null ? 'project' : state.files.length ? 'review' : 'upload';
        if (step !== 'project') goTo(step);
      }}
      onReset={onReset}
    />
  );
}

export function App({ store, platform, storageNotice, initialAssistKey, hostNotice }: AppProps) {
  const state = useStore(store, (s) => s);
  const lang: Language = state.language;
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<LangText | undefined>(undefined);
  const [mapFact, setMapFact] = useState<Fact | null>(null);
  const [assistPrefill, setAssistPrefill] = useState<SuggestionPrefill | null>(null);
  const [assistConfig, setAssistConfig] = useState<AssistConfig>(() => ({
    provider: 'anthropic',
    model: platform.assist?.defaultModel('anthropic') ?? '',
    apiKey: initialAssistKey ?? '',
  }));
  const [rememberKey, setRememberKey] = useState(initialAssistKey !== undefined);
  const [assistRun, setAssistRun] = useState<{ controller: AbortController } | null>(null);
  const [assistError, setAssistError] = useState<string | undefined>(undefined);
  const [assistOpen, setAssistOpen] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const [status, setStatus] = useState<ShellStatus>(null);
  // Forces a render so the theme icon flips; the theme itself lives on `<html>`, not in state.
  const [, bump] = useState(0);
  const [asOf] = useState(() => nowIso());
  const derived = derive(state, asOf);
  const dispatch = store.dispatch;

  /**
   * Every step change dispatches through here, so leaving review always clears `reviewSearch`
   * (without it, a stale search left over from an earlier "fix in review" would prefill the box
   * again on a later, unrelated arrival at review) and a status left over from the previous
   * screen never follows the reviewer to the next one.
   */
  const goTo = (step: Step) => {
    if (state.step === 'review' && step !== 'review') setReviewSearch('');
    setStatus(null);
    dispatch({ type: 'goTo', step, at: nowIso() });
  };

  const fail = (e: unknown) =>
    setStatus({ kind: 'error', text: e instanceof Error ? e.message : String(e) });

  const reset = () => {
    platform.clearPersisted();
    dispatch({ type: 'reset', at: nowIso() });
    setReviewSearch('');
    setStatus(null);
  };

  const onFiles = async (files: File[]) => {
    if (!derived || files.length === 0) return;
    setStatus(null);
    // Read the generation before the awaits: by the time the ingest resolves the reviewer may
    // have started over or imported a draft, and these documents belong to a project that is
    // no longer on screen.
    const generation = store.getState().generation;
    setBusy(true);
    try {
      const inputs = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
          size: f.size,
        })),
      );
      const out = await ingestFiles(
        inputs,
        platform.pdfWorkerSrc !== undefined ? { workerSrc: platform.pdfWorkerSrc } : {},
      );
      if (store.getState().generation !== generation) return;
      dispatch({ type: 'filesIngested', ...out, at: nowIso() });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /**
   * One assist run (ADR D-038). The request is built here so the disclosure panel shows exactly
   * what a run would send, and the result becomes state the reviewer acts on — never a
   * decision, and never a change to the draft.
   */
  const assistInput = () =>
    derived && state.project
      ? {
          category: derived.meta.category,
          language: lang,
          facts: derived.facts,
          proposals: derived.proposals,
          decisions: state.decisions,
        }
      : null;

  const onAssistRun = async () => {
    const input = assistInput();
    if (!input || !platform.assist) return;
    const controller = new AbortController();
    setAssistRun({ controller });
    setAssistError(undefined);
    // What the answer will be judged against. The reviewer keeps working while the model
    // thinks, and a result built for another category means nothing under this one.
    const before = { generation: store.getState().generation, category: input.category };
    try {
      const client = platform.assist.client(assistConfig);
      const result = await runAssist({ ...input, client }, controller.signal);
      const now = store.getState();
      const nowCategory = derive(now, asOf)?.meta.category;
      if (now.generation !== before.generation || nowCategory !== before.category) {
        setAssistError(t(lang, 'assist.stale'));
        return;
      }
      // The reducer runs the "already decided" guard again as this lands: a decision made
      // while the model was answering must not be overwritten by a suggestion that predates it.
      dispatch({
        type: 'assistRan',
        result,
        provider: assistConfig.provider,
        model: assistConfig.model,
        at: nowIso(),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setAssistError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssistRun(null);
    }
  };

  /**
   * The key is written whenever the reviewer's current preference says so — when the box is
   * ticked and when the key changes under a ticked box — and never at the end of a run. A run
   * captures its state at the moment it starts, so persisting there would let an answer that
   * arrives after the box was unticked write the secret back (ADR D-038's opt-in is explicit).
   */
  const persistKey = (remember: boolean, apiKey: string) => {
    if (!platform.assist) return;
    if (remember && apiKey !== '') void platform.assist.saveKey(apiKey);
    else void platform.assist.clearKey();
  };

  const onRememberChange = (remember: boolean) => {
    setRememberKey(remember);
    persistKey(remember, assistConfig.apiKey);
  };

  const assistPanel = (() => {
    const input = assistInput();
    const assist = platform.assist;
    if (!assist || !input) return undefined;
    const { request } = buildRequest(input);
    return (
      <AssistPanel
        lang={lang}
        config={assistConfig}
        onConfigChange={(c) => {
          // Switching provider carries the key over but not a model id the other one
          // would not recognise.
          const next =
            c.provider === assistConfig.provider
              ? c
              : { ...c, model: assist.defaultModel(c.provider) };
          setAssistConfig(next);
          // Typing a key under a ticked box has to persist it here: a run no longer writes
          // the key at all, so this is the only moment that "remember" can act on.
          if (next.apiKey !== assistConfig.apiKey) persistKey(rememberKey, next.apiKey);
        }}
        remember={rememberKey}
        onRememberChange={onRememberChange}
        disclosure={{
          facts: request.facts.length,
          proposals: request.proposals.length,
          catalogue: request.catalogue.length,
          endpoint: assist.endpointLabel(assistConfig),
          json: JSON.stringify(request, null, 2),
        }}
        assist={state.assist}
        running={assistRun !== null}
        {...(assistError === undefined ? {} : { error: assistError })}
        onRun={() => void onAssistRun()}
        onCancel={() => assistRun?.controller.abort()}
        onAccept={(s: AssistSuggestion) => {
          const prefill = derived ? suggestionPrefill(s, derived.facts) : null;
          if (prefill) setAssistPrefill(prefill);
        }}
        onDismiss={(s: AssistSuggestion) =>
          dispatch({
            type: 'assistDismissed',
            factId: s.factId,
            attributeId: s.attributeId,
            ...(s.path === undefined ? {} : { path: s.path }),
            at: nowIso(),
          })
        }
      />
    );
  })();

  const onExport = (kind: ExportKind) => {
    if (!derived) return;
    setStatus(null);
    try {
      const out = buildExports(derived, lang);
      if ('error' in out) {
        setExportError(out.error);
        return;
      }
      const file = out.files[kind];
      if (kind === 'qr' && !file) {
        setExportError(
          out.carrierError ?? {
            de: 'QR-Code konnte nicht erzeugt werden.',
            en: 'The QR code could not be generated.',
          },
        );
        return;
      }
      setExportError(undefined);
      if (file) platform.download(file, kind);
    } catch (e) {
      fail(e);
    }
  };

  const reachable = (step: Step): boolean => {
    if (step === 'project') return true;
    if (step === 'upload')
      return state.project !== null && deriveProject(state.project, asOf).meta !== null;
    if (step === 'facts') return state.facts !== null && derived !== null;
    return derived !== null;
  };

  const accepted = Object.values(state.decisions).filter((d) => d.kind !== 'reject').length;
  const groups = buildGroups(derived?.proposals ?? [], state.decisions);
  const pending = groups.filter((g) => !g.decision).length;

  // A caught failure (an ingest error, or an export exception `fail(e)` catches) is shown on
  // whichever screen is active when it happens, not only on upload: the `upload-error` test id
  // is kept for the upload screen specifically, so the existing assertion survives unchanged,
  // and every other screen shows the same status under `shell-error`.
  const notice = (
    <>
      {status?.kind === 'error' && (
        <InlineStatus
          kind="error"
          text={status.text}
          data-testid={state.step === 'upload' ? 'upload-error' : 'shell-error'}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void navigator.clipboard?.writeText(status.text).catch(() => undefined)
              }
            >
              {t(lang, 'shell.copy')}
            </Button>
          }
        />
      )}
      {storageNotice && (
        <InlineStatus
          kind="info"
          text={t(
            lang,
            storageNotice === 'version' ? 'app.storage.version' : 'app.storage.unavailable',
          )}
          data-testid="storage-notice"
        />
      )}
      {hostNotice && <InlineStatus kind="info" text={hostNotice} data-testid="host-notice" />}
    </>
  );

  const display = platform.display;
  const canFullscreen = display?.available().includes('fullscreen') ?? false;
  const top = (
    <>
      <span className="shrink-0 font-mono text-[13px] tracking-[0.1em] text-display">PASSWERK</span>
      <Stepper lang={lang} steps={STEPS} current={state.step} reachable={reachable} onGo={goTo} />
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {platform.theme && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="theme-toggle"
            aria-label={t(
              lang,
              platform.theme.current() === 'dark' ? 'shell.theme.light' : 'shell.theme.dark',
            )}
            onClick={() => {
              platform.theme?.set(platform.theme.current() === 'dark' ? 'light' : 'dark');
              bump((n) => n + 1);
            }}
          >
            {t(
              lang,
              platform.theme.current() === 'dark'
                ? 'shell.theme.light.short'
                : 'shell.theme.dark.short',
            )}
          </Button>
        )}
        {canFullscreen && display && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="display-toggle"
            aria-label={t(
              lang,
              display.current() === 'fullscreen' ? 'shell.inline' : 'shell.fullscreen',
            )}
            onClick={() =>
              void display.request(display.current() === 'fullscreen' ? 'inline' : 'fullscreen')
            }
          >
            <Maximize2 />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          data-testid="lang-toggle"
          onClick={() =>
            dispatch({ type: 'setLanguage', language: lang === 'de' ? 'en' : 'de', at: nowIso() })
          }
        >
          {lang === 'de' ? 'EN' : 'DE'}
        </Button>
        {state.project && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" data-testid="start-over">
                {t(lang, 'app.startOver')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t(lang, 'app.startOver')}</AlertDialogTitle>
                <AlertDialogDescription>{t(lang, 'app.startOver.confirm')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="ghost">{t(lang, 'app.cancel')}</AlertDialogCancel>
                <AlertDialogAction data-testid="start-over-confirm" onClick={reset}>
                  {t(lang, 'app.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </span>
    </>
  );

  const view = (() => {
    switch (state.step) {
      case 'project':
        return (
          <ProjectStep
            key={state.generation}
            lang={lang}
            state={state}
            asOf={asOf}
            derived={derived}
            dispatch={dispatch}
            goTo={goTo}
            top={top}
            notice={notice}
            onImport={(text) => {
              const r = importDraftJson(text);
              if (r.ok) dispatch({ type: 'importDraft', draft: r.draft, at: nowIso() });
              return r.ok ? { ok: true } : { ok: false, message: r.message };
            }}
            onReset={reset}
          />
        );
      case 'upload':
        return (
          <UploadView
            lang={lang}
            top={top}
            notice={notice}
            files={state.files}
            busy={busy}
            proposalCount={derived?.proposals.length ?? 0}
            onFiles={(files) => void onFiles(files)}
            onRemove={(name) => dispatch({ type: 'fileRemoved', name, at: nowIso() })}
            onContinue={() => goTo('facts')}
          />
        );
      case 'facts':
        if (!derived) return null;
        return (
          <FactsView
            lang={lang}
            top={top}
            notice={notice}
            facts={derived.facts.facts}
            documents={state.files.map((f) => f.name)}
            edits={state.factEdits}
            statuses={factStatuses(derived.facts.facts, derived.proposals, state.decisions)}
            onEdit={(factId, edit) => dispatch({ type: 'editFact', factId, edit, at: nowIso() })}
            onClearEdit={(factId) => dispatch({ type: 'clearFactEdit', factId, at: nowIso() })}
            onMap={setMapFact}
            onContinue={() => goTo('review')}
          >
            {mapFact && (
              <AddValueDialog
                key={mapFact.id}
                lang={lang}
                category={derived.meta.category}
                arrayRows={(id) => currentRows(id, derived.draft, state.decisions)}
                open
                hideTrigger
                prefill={{
                  factId: mapFact.id,
                  value: mapFact.value ?? mapFact.raw,
                  ...(mapFact.unit ? { unit: mapFact.unit } : {}),
                }}
                onOpenChange={(o) => {
                  if (!o) setMapFact(null);
                }}
                onAdd={(d) => {
                  dispatch({ type: 'decide', decision: d, at: nowIso() });
                  setMapFact(null);
                }}
              />
            )}
          </FactsView>
        );
      case 'review':
        if (!derived) return null;
        return (
          <ReviewView
            lang={lang}
            top={top}
            notice={notice}
            category={derived.meta.category}
            groups={groups}
            manual={manualEntries(state.decisions)}
            arrays={arrayEntries(derived.meta.category, derived.draft, state.decisions)}
            arrayRows={(id) => currentRows(id, derived.draft, state.decisions)}
            conflicts={derived.conflicts}
            invalidDecisions={derived.invalidDecisions}
            accepted={accepted}
            pending={pending}
            verdict={derived.report.verdict}
            critiques={state.assist?.critiques ?? []}
            {...(assistPanel ? { assistPanel } : {})}
            assistOpen={assistOpen}
            onAssistToggle={() => setAssistOpen((o) => !o)}
            initialSearch={reviewSearch}
            onDecide={(d: Decision) => dispatch({ type: 'decide', decision: d, at: nowIso() })}
            onClear={(key: DecisionKey) => dispatch({ type: 'clearDecision', key, at: nowIso() })}
            onContinue={() => goTo('gaps')}
          >
            {assistPrefill && (
              <AddValueDialog
                key={`${assistPrefill.factId}|${assistPrefill.attributeId}`}
                lang={lang}
                category={derived.meta.category}
                arrayRows={(id) => currentRows(id, derived.draft, state.decisions)}
                open
                hideTrigger
                prefill={assistPrefill}
                onOpenChange={(o) => {
                  if (!o) setAssistPrefill(null);
                }}
                onAdd={(d) => {
                  dispatch({ type: 'decide', decision: d, at: nowIso() });
                  setAssistPrefill(null);
                }}
              />
            )}
          </ReviewView>
        );
      case 'gaps':
        if (!derived) return null;
        return (
          <GapsView
            lang={lang}
            top={top}
            notice={notice}
            report={derived.report}
            gap={derived.gap}
            onFixInReview={(attributeId) => {
              setReviewSearch(
                pick(lang, getAttribute(attributeId)?.name ?? { de: attributeId, en: attributeId }),
              );
              goTo('review');
            }}
            onContinue={() => goTo('export')}
          />
        );
      case 'export':
        if (!derived) return null;
        return (
          <ExportView
            saveToFolder={platform.exportAction?.() === 'save'}
            lang={lang}
            top={top}
            notice={notice}
            report={derived.report}
            gap={derived.gap}
            carrier={derived.carrier}
            {...(exportError ? { exportError } : {})}
            onExport={onExport}
          />
        );
    }
  })();

  return (
    <ErrorBoundary lang={lang} onReset={reset}>
      {view}
    </ErrorBoundary>
  );
}
