/** @vitest-environment jsdom */

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App.tsx';
import { ErrorBoundary } from '@/app/ErrorBoundary.tsx';
import type { IngestOutcome } from '@/workflow/ingest.ts';
import { defaultProject } from '@/workflow/project.ts';
import { initialState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';
import { mount } from './render.tsx';

const { ingestFiles } = vi.hoisted(() => ({ ingestFiles: vi.fn() }));
vi.mock('@/workflow/ingest.ts', () => ({ ingestFiles }));

/** Radix's Select ignores a synthetic click; the keyboard path works under jsdom. */
function openSelect(testId: string): void {
  fireEvent.keyDown(screen.getByTestId(testId), { key: 'ArrowDown' });
}

function chooseAttribute(id: string): void {
  openSelect('add-attribute');
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`\\(${id}\\)`) }));
}

const AT = '2026-09-05T12:00:00Z';
const platform = { download: vi.fn(), clearPersisted: vi.fn() };

const OUTCOME: IngestOutcome = {
  summaries: [{ name: 'a.csv', size: 3, sha256: 'x', format: 'csv', pages: 1, lang: 'de' }],
  facts: {
    facts: [
      {
        id: 'a.csv#1:0',
        label: 'Nennkapazität',
        labelKey: 'nennkapazitaet',
        raw: '94,5',
        value: '94.5',
        kind: 'decimal',
        unit: 'Ah',
        lang: 'de',
        shape: 'kv',
        source: { file: 'a.csv', page: 1 },
      },
    ],
    tables: [],
    documents: [],
  },
};

describe('App', () => {
  it('starts on the project step, toggles language and starts a project', () => {
    const store = createStore(initialState);
    mount(<App store={store} platform={platform} />);
    expect(screen.getByText('Batterietyp')).toBeTruthy();
    fireEvent.click(screen.getByTestId('lang-toggle'));
    expect(screen.getByText('Battery type')).toBeTruthy();
    fireEvent.click(screen.getByTestId('project-continue'));
    expect(store.getState().step).toBe('upload');
    expect(store.getState().project?.batteryType).toBe('EV');
    expect(screen.getByText('Upload documents')).toBeTruthy();
  });
  it('shows the storage notice', () => {
    mount(<App store={createStore(initialState)} platform={platform} storageNotice="version" />);
    expect(screen.getByTestId('storage-notice')).toBeTruthy();
  });

  it('drops an upload that finishes after the project was replaced', async () => {
    let finish: (out: IngestOutcome) => void = () => undefined;
    ingestFiles.mockReturnValueOnce(
      new Promise<IngestOutcome>((resolve) => {
        finish = resolve;
      }),
    );
    const store = createStore(initialState);
    mount(<App store={store} platform={platform} />);
    fireEvent.click(screen.getByTestId('project-continue'));
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['a;b'], 'a.csv', { type: 'text/csv' })] },
    });

    // The reviewer starts over while the ingest is still running.
    await act(async () => {
      store.dispatch({ type: 'reset', at: AT });
      store.dispatch({
        type: 'setProject',
        project: defaultProject('urn:passwerk:test:2', AT),
        at: AT,
      });
    });
    await act(async () => {
      finish(OUTCOME);
    });

    expect(ingestFiles).toHaveBeenCalledOnce();
    expect(store.getState().files).toEqual([]);
  });

  it('continues from upload to the facts screen', async () => {
    ingestFiles.mockResolvedValueOnce(OUTCOME);
    const store = createStore(initialState);
    mount(<App store={store} platform={platform} />);
    fireEvent.click(screen.getByTestId('lang-toggle'));
    fireEvent.click(screen.getByTestId('project-continue'));
    await act(async () => {
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [new File(['a;b'], 'a.csv', { type: 'text/csv' })] },
      });
    });
    const continueButton = screen.getByTestId('continue');
    expect(continueButton.textContent).toContain('facts');
    fireEvent.click(continueButton);
    expect(store.getState().step).toBe('facts');
    expect(screen.getByText('Extracted facts')).toBeTruthy();
  });

  it('the facts-screen map dialog passes existing array rows through arrayRows', () => {
    const store = createStore(initialState);
    store.dispatch({
      type: 'setProject',
      project: defaultProject('urn:passwerk:test:facts-arrayrows', AT),
      at: AT,
    });
    store.dispatch({
      type: 'filesIngested',
      summaries: [{ name: 'a.csv', size: 3, sha256: 'x', format: 'csv', pages: 1, lang: 'de' }],
      facts: OUTCOME.facts,
      at: AT,
    });
    store.dispatch({
      type: 'decide',
      decision: {
        kind: 'manual',
        attributeId: 'criticalRawMaterials',
        value: [
          { name: 'Lithium', identifier: '7439-93-2' },
          { name: 'Cobalt', identifier: '7440-48-4' },
        ],
      },
      at: AT,
    });
    store.dispatch({ type: 'goTo', step: 'facts', at: AT });
    mount(<App store={store} platform={platform} />);
    fireEvent.click(screen.getByTestId('fact-map'));
    chooseAttribute('criticalRawMaterials');
    // Without `arrayRows` wired through, the row editor would open with a single empty row
    // (the same regression AddValueDialog's `arrayRows` prop already guards against in
    // ReviewView) and Save would silently replace the two rows above.
    expect(screen.getAllByTestId('rows-row')).toHaveLength(2);
  });

  it('resumes to review when the project is valid and files exist', () => {
    const store = createStore(initialState);
    store.dispatch({
      type: 'setProject',
      project: defaultProject('urn:passwerk:test:1', AT),
      at: AT,
    });
    store.dispatch({
      type: 'filesIngested',
      summaries: [{ name: 'a.csv', size: 3, sha256: 'x', format: 'csv', pages: 1, lang: 'de' }],
      facts: { facts: [], tables: [], documents: [] },
      at: AT,
    });
    mount(<App store={store} platform={platform} />);
    // Default state language is 'de'.
    fireEvent.click(screen.getByText('Fortsetzen'));
    expect(store.getState().step).toBe('review');
  });

  it('resumes to upload when the project is valid but no files exist', () => {
    const store = createStore(initialState);
    store.dispatch({
      type: 'setProject',
      project: defaultProject('urn:passwerk:test:2', AT),
      at: AT,
    });
    mount(<App store={store} platform={platform} />);
    // Default state language is 'de'.
    fireEvent.click(screen.getByText('Fortsetzen'));
    expect(store.getState().step).toBe('upload');
  });

  it('disables the Dokumente step until a project exists', () => {
    const store = createStore(initialState);
    mount(<App store={store} platform={platform} />);
    expect((screen.getByTestId('step-upload') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables the Fakten step when facts exist but the project derives no meta', () => {
    const store = createStore(initialState);
    // PORTABLE resolves no obligations category and the project has no manual category
    // either, so `derive` returns null even though `state.facts` is set.
    const project = {
      ...defaultProject('urn:passwerk:test:portable-facts', AT),
      batteryType: 'PORTABLE' as const,
    };
    store.dispatch({ type: 'setProject', project, at: AT });
    store.dispatch({
      type: 'filesIngested',
      summaries: [{ name: 'a.csv', size: 3, sha256: 'x', format: 'csv', pages: 1, lang: 'de' }],
      facts: { facts: [], tables: [], documents: [] },
      at: AT,
    });
    mount(<App store={store} platform={platform} />);
    expect((screen.getByTestId('step-facts') as HTMLButtonElement).disabled).toBe(true);
  });

  it('start over re-seeds the project form instead of reusing the previous identifier', () => {
    const store = createStore(initialState);
    mount(<App store={store} platform={platform} />);
    // Default mode is 'draft': capture the freshly generated placeholder URN before switching
    // away from it, so it can be compared against the one generated after the reset.
    const firstUrn = (screen.getByTestId('identifier-urn') as HTMLInputElement).value;
    expect(firstUrn.startsWith('urn:passwerk:draft:')).toBe(true);

    fireEvent.click(screen.getByTestId('identifier-mode-https'));
    fireEvent.change(screen.getByTestId('identifier-uri'), {
      target: { value: 'https://example.com/passport/1' },
    });
    fireEvent.click(screen.getByTestId('project-continue'));
    expect(store.getState().project?.identifier).toEqual({
      mode: 'https',
      uri: 'https://example.com/passport/1',
    });

    fireEvent.click(screen.getByTestId('start-over'));
    fireEvent.click(screen.getByTestId('start-over-confirm'));

    expect(store.getState().project).toBeNull();
    // Back on the project step in the default 'draft' mode: a freshly generated URN, not the
    // https identifier just entered and not the same draft URN as before this reset.
    const urnInput = screen.getByTestId('identifier-urn') as HTMLInputElement;
    expect(urnInput.value.startsWith('urn:passwerk:draft:')).toBe(true);
    expect(urnInput.value).not.toBe(firstUrn);
  });

  it('resume stays on the project step when the derived meta is null', () => {
    const store = createStore(initialState);
    // PORTABLE resolves no obligations category and the project has no manual category either,
    // so `derive` returns null: nothing to resume into.
    const project = {
      ...defaultProject('urn:passwerk:test:3', AT),
      batteryType: 'PORTABLE' as const,
    };
    store.dispatch({ type: 'setProject', project, at: AT });
    mount(<App store={store} platform={platform} />);
    // Default state language is 'de'.
    fireEvent.click(screen.getByText('Fortsetzen'));
    expect(store.getState().step).toBe('project');
  });
});

describe('ErrorBoundary', () => {
  let shouldThrow = true;
  function Boom() {
    if (shouldThrow) throw new Error('boom');
    return <p>recovered</p>;
  }

  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught render errors to console.error; the throw here is expected.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('clears its own error state when start-over is clicked, so the child can recover', () => {
    const onReset = vi.fn(() => {
      shouldThrow = false;
    });
    mount(
      <ErrorBoundary lang="de" onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByText('Neu beginnen'));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('recovered')).toBeTruthy();
  });
});
