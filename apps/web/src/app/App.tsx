import type { Fact } from '@passwerk/core';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
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
import { FactsView } from '../views/FactsView.tsx';
import { GapsExportView } from '../views/GapsExportView.tsx';
import { ProjectView } from '../views/ProjectView.tsx';
import { ReviewView } from '../views/ReviewView.tsx';
import { arrayEntries, buildGroups, currentRows, manualEntries } from '../views/reviewModel.ts';
import { UploadView } from '../views/UploadView.tsx';
import { derive } from '../workflow/derive/index.ts';
import { deriveProject } from '../workflow/derive/project.ts';
import { importDraftJson } from '../workflow/draftIo.ts';
import { buildExports, type ExportKind } from '../workflow/exports.ts';
import { factStatuses } from '../workflow/factsModel.ts';
import { ingestFiles } from '../workflow/ingest.ts';
import { defaultProject, type Project } from '../workflow/project.ts';
import { type Decision, type DecisionKey, STEPS, type Step } from '../workflow/state.ts';
import type { Store } from '../workflow/store.ts';
import { nowIso } from './clock.ts';
import { downloadFile } from './download.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { clearState } from './persistence.ts';
import { useStore } from './useStore.ts';

export interface AppProps {
  store: Store;
  storageNotice?: 'unavailable' | 'version';
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

export function App({ store, storageNotice }: AppProps) {
  const state = useStore(store, (s) => s);
  const lang: Language = state.language;
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<LangText | undefined>(undefined);
  const [mapFact, setMapFact] = useState<Fact | null>(null);
  const [asOf] = useState(() => nowIso());
  const [draftUrn] = useState(() => `urn:passwerk:draft:${randomId()}`);
  const [localProject, setLocalProject] = useState(() => defaultProject(draftUrn, ''));
  const derived = derive(state, asOf);
  const dispatch = store.dispatch;
  const project = state.project ?? localProject;
  const projectDerived = deriveProject(project, asOf);
  const onProjectChange = (p: Project) => {
    if (state.project) dispatch({ type: 'setProject', project: p, at: nowIso() });
    else setLocalProject(p);
  };
  const onProjectContinue = () => {
    const at = nowIso();
    if (!state.project) dispatch({ type: 'setProject', project: localProject, at });
    dispatch({ type: 'goTo', step: 'upload', at });
  };

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
    void clearState();
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
      const out = await ingestFiles(inputs, { workerSrc: pdfWorkerUrl });
      if (store.getState().generation !== generation) return;
      dispatch({ type: 'filesIngested', ...out, at: nowIso() });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

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
      if (file) downloadFile(file);
    } catch (e) {
      fail(e);
    }
  };

  const reachable = (step: Step): boolean => {
    if (step === 'project') return true;
    if (step === 'upload') return projectDerived.meta !== null;
    if (step === 'facts') return state.facts !== null;
    return derived !== null;
  };

  const accepted = Object.values(state.decisions).filter((d) => d.kind !== 'reject').length;
  const groups = buildGroups(derived?.proposals ?? [], state.decisions);
  const pending = groups.filter((g) => !g.decision).length;

  const view = (() => {
    switch (state.step) {
      case 'project':
        return (
          <ProjectView
            lang={lang}
            project={project}
            derived={projectDerived}
            isNew={state.project === null}
            draftUrn={draftUrn}
            {...(state.project
              ? { resume: { files: state.files.map((f) => f.name), updatedAt: state.updatedAt } }
              : {})}
            onChange={onProjectChange}
            onContinue={onProjectContinue}
            onImport={(text) => {
              const r = importDraftJson(text);
              if (r.ok) dispatch({ type: 'importDraft', draft: r.draft, at: nowIso() });
              return r.ok ? { ok: true } : { ok: false, message: r.message };
            }}
            onResume={() => {
              const step = derived === null ? 'project' : state.files.length ? 'review' : 'upload';
              if (step !== 'project') dispatch({ type: 'goTo', step, at: nowIso() });
            }}
            onReset={reset}
          />
        );
      case 'upload':
        return (
          <UploadView
            lang={lang}
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
          <>
            <FactsView
              lang={lang}
              facts={derived.facts.facts}
              documents={state.files.map((f) => f.name)}
              edits={state.factEdits}
              statuses={factStatuses(derived.facts.facts, derived.proposals, state.decisions)}
              onEdit={(factId, edit) => dispatch({ type: 'editFact', factId, edit, at: nowIso() })}
              onClearEdit={(factId) => dispatch({ type: 'clearFactEdit', factId, at: nowIso() })}
              onMap={setMapFact}
              onContinue={() => dispatch({ type: 'goTo', step: 'review', at: nowIso() })}
            />
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
          </>
        );
      case 'review':
        if (!derived) return null;
        return (
          <ReviewView
            lang={lang}
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
            onDecide={(d: Decision) => dispatch({ type: 'decide', decision: d, at: nowIso() })}
            onClear={(key: DecisionKey) => dispatch({ type: 'clearDecision', key, at: nowIso() })}
            onContinue={() => dispatch({ type: 'goTo', step: 'gaps', at: nowIso() })}
          />
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
              variant={state.step === step ? 'default' : 'ghost'}
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
            variant="outline"
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
      <Toaster />
    </div>
  );
}
