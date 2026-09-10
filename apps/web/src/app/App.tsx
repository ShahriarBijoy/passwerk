import type { Fact } from '@passwerk/core';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { Toaster } from '@/components/ui/sonner';
import { type LangText, type Language, t } from '../i18n/index.ts';
import { AddValueDialog } from '../views/AddValueDialog.tsx';
import { AssistPanel } from '../views/AssistPanel.tsx';
import { FactsView } from '../views/FactsView.tsx';
import { GapsExportView } from '../views/GapsExportView.tsx';
import { ProjectView } from '../views/ProjectView.tsx';
import { ReviewView } from '../views/ReviewView.tsx';
import { arrayEntries, buildGroups, currentRows, manualEntries } from '../views/reviewModel.ts';
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
}

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
  onImport,
  onReset,
}: {
  lang: Language;
  state: WorkflowState;
  asOf: string;
  derived: Derived | null;
  dispatch: Store['dispatch'];
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
    const at = nowIso();
    if (!state.project) dispatch({ type: 'setProject', project: localProject, at });
    dispatch({ type: 'goTo', step: 'upload', at });
  };

  return (
    <ProjectView
      lang={lang}
      project={project}
      derived={projectDerived}
      isNew={state.project === null}
      draftUrn={draftUrn}
      top={<span className="label">passwerk</span>}
      {...(state.project
        ? { resume: { files: state.files.map((f) => f.name), updatedAt: state.updatedAt } }
        : {})}
      onChange={onChange}
      onContinue={onContinue}
      onImport={onImport}
      onResume={() => {
        const step = derived === null ? 'project' : state.files.length ? 'review' : 'upload';
        if (step !== 'project') dispatch({ type: 'goTo', step, at: nowIso() });
      }}
      onReset={onReset}
    />
  );
}

export function App({ store, platform, storageNotice, initialAssistKey }: AppProps) {
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
  const [asOf] = useState(() => nowIso());
  const derived = derive(state, asOf);
  const dispatch = store.dispatch;

  const fail = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    toast.error(t(lang, 'app.error.title'), {
      description: message,
      action: {
        label: t(lang, 'app.error.copy'),
        onClick: () => void navigator.clipboard?.writeText(message).catch(() => undefined),
      },
    });
  };

  const reset = () => {
    platform.clearPersisted();
    dispatch({ type: 'reset', at: nowIso() });
  };

  const onFiles = async (files: File[]) => {
    if (!derived || files.length === 0) return;
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
      if (file) platform.download(file);
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
            top={<span className="label">passwerk</span>}
            files={state.files}
            busy={busy}
            proposalCount={derived?.proposals.length ?? 0}
            onFiles={(files) => void onFiles(files)}
            onRemove={(name) => dispatch({ type: 'fileRemoved', name, at: nowIso() })}
            onContinue={() => dispatch({ type: 'goTo', step: 'facts', at: nowIso() })}
          />
        );
      case 'facts':
        if (!derived) return null;
        return (
          <FactsView
            lang={lang}
            top={<span className="label">passwerk</span>}
            facts={derived.facts.facts}
            documents={state.files.map((f) => f.name)}
            edits={state.factEdits}
            statuses={factStatuses(derived.facts.facts, derived.proposals, state.decisions)}
            onEdit={(factId, edit) => dispatch({ type: 'editFact', factId, edit, at: nowIso() })}
            onClearEdit={(factId) => dispatch({ type: 'clearFactEdit', factId, at: nowIso() })}
            onMap={setMapFact}
            onContinue={() => dispatch({ type: 'goTo', step: 'review', at: nowIso() })}
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
            top={<span className="label">passwerk</span>}
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
            assistOpen={false}
            onDecide={(d: Decision) => dispatch({ type: 'decide', decision: d, at: nowIso() })}
            onClear={(key: DecisionKey) => dispatch({ type: 'clearDecision', key, at: nowIso() })}
            onContinue={() => dispatch({ type: 'goTo', step: 'gaps', at: nowIso() })}
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
          <GapsExportView
            lang={lang}
            report={derived.report}
            gap={derived.gap}
            carrier={derived.carrier}
            {...(exportError ? { exportError } : {})}
            onExport={onExport}
          />
        );
      case 'export':
        return null;
    }
  })();

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3 border-b pb-3">
        <h1 className="font-bold text-xl">{t(lang, 'app.title')}</h1>
        <span className="text-muted-foreground text-sm">{t(lang, 'app.tagline')}</span>
        <nav className="flex gap-1" aria-label={t(lang, 'step.nav')}>
          {STEPS.map((step) => (
            <Button
              key={step}
              size="sm"
              variant={state.step === step ? 'primary' : 'ghost'}
              disabled={!reachable(step)}
              data-testid={`step-${step}`}
              onClick={() => dispatch({ type: 'goTo', step, at: nowIso() })}
            >
              {t(lang, `step.${step}`)}
            </Button>
          ))}
        </nav>
        <span className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
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
                <Button size="sm" variant="ghost" data-testid="start-over">
                  {t(lang, 'app.startOver')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t(lang, 'app.startOver')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(lang, 'app.startOver.confirm')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t(lang, 'app.cancel')}</AlertDialogCancel>
                  <AlertDialogAction data-testid="start-over-confirm" onClick={reset}>
                    {t(lang, 'app.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </span>
      </header>
      {storageNotice && (
        <p className="rounded-md border p-2 text-sm" data-testid="storage-notice">
          {t(lang, storageNotice === 'version' ? 'app.storage.version' : 'app.storage.unavailable')}
        </p>
      )}
      <ErrorBoundary lang={lang} onReset={reset}>
        {view}
      </ErrorBoundary>
      {assistPrefill && derived && state.step !== 'review' && (
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
      <Toaster />
    </div>
  );
}
