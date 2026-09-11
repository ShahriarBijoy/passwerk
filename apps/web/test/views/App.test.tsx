/** @vitest-environment jsdom */

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App.tsx';
import { ErrorBoundary } from '@/app/ErrorBoundary.tsx';
import type { IngestOutcome } from '@/workflow/ingest.ts';
import { defaultProject } from '@/workflow/project.ts';
import { reduce } from '@/workflow/reducer.ts';
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
    expect(
      screen.getByText('PDF, XLSX, DOCX, CSV or TXT. Files never leave the browser.'),
    ).toBeTruthy();
  });
  it('shows the storage notice', () => {
    mount(<App store={createStore(initialState)} platform={platform} storageNotice="version" />);
    expect(screen.getByTestId('storage-notice')).toBeTruthy();
  });

  it('renders the storage notice inside the instrument footer, not above the frame', () => {
    mount(<App store={createStore(initialState)} platform={platform} storageNotice="version" />);
    const footer = screen.getByTestId('storage-notice').closest('[data-region="footer"]');
    expect(footer).toBeTruthy();
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
    expect(screen.getByTestId('facts-count')).toBeTruthy();
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
    fireEvent.click(screen.getByTestId('fact-row'));
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

  it('shows six steps and reaches export exactly when gaps is reachable', () => {
    const store = createStore(initialState);
    mount(<App store={store} platform={platform} />);
    expect(screen.getAllByTestId(/^step-/)).toHaveLength(6);
    expect((screen.getByTestId('step-export') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('step-gaps') as HTMLButtonElement).disabled).toBe(true);
  });

  it('names the theme it switches to rather than drawing a glyph the bundled fonts lack', () => {
    const set = vi.fn();
    mount(
      <App
        store={createStore(initialState)}
        platform={{ ...platform, theme: { current: () => 'dark', set } }}
      />,
    );
    // The subset in `scripts/fonts.mjs` carries the glyphs the shell draws, and a sun and a moon
    // are not among them, so the control used to fall back to whatever the system had and read
    // as a stray dot. A mono caps word is a control the way `EN` beside it is.
    const toggle = screen.getByTestId('theme-toggle');
    expect(toggle.textContent).toBe('Hell');
    fireEvent.click(toggle);
    expect(set).toHaveBeenCalledWith('light');
  });

  it('shows the fullscreen control only when the platform offers it', () => {
    const request = vi.fn(async () => undefined);
    const { unmount } = mount(<App store={createStore(initialState)} platform={platform} />);
    expect(screen.queryByTestId('display-toggle')).toBeNull();
    unmount();
    mount(
      <App
        store={createStore(initialState)}
        platform={{
          ...platform,
          display: { available: () => ['inline', 'fullscreen'], current: () => 'inline', request },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('display-toggle'));
    expect(request).toHaveBeenCalledWith('fullscreen');
  });

  it('shows an export exception on the export screen through the same notice mechanism', () => {
    const store = createStore(initialState);
    store.dispatch({
      type: 'setProject',
      project: defaultProject('urn:passwerk:test:export-error', AT),
      at: AT,
    });
    store.dispatch({
      type: 'filesIngested',
      summaries: [{ name: 'a.csv', size: 3, sha256: 'x', format: 'csv', pages: 1, lang: 'de' }],
      facts: { facts: [], tables: [], documents: [] },
      at: AT,
    });
    store.dispatch({ type: 'goTo', step: 'export', at: AT });
    const download = vi.fn(() => {
      throw new Error('disk full');
    });
    mount(<App store={store} platform={{ ...platform, download }} />);
    fireEvent.click(screen.getByTestId('export-aasJson'));
    expect(screen.getByTestId('shell-error').textContent).toContain('disk full');
  });

  it('reports an ingest failure inline, not as a toast', async () => {
    ingestFiles.mockRejectedValueOnce(new Error('body too large'));
    const store = createStore(initialState);
    mount(<App store={store} platform={platform} />);
    fireEvent.click(screen.getByTestId('project-continue'));
    await act(async () => {
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [new File(['a'], 'a.csv', { type: 'text/csv' })] },
      });
    });
    expect(screen.getByTestId('upload-error').textContent).toContain('body too large');
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

  it('"fix in review" prefills the search, but leaving and returning to review clears it', () => {
    const store = reviewStore();
    store.dispatch({ type: 'goTo', step: 'gaps', at: AT });
    mount(<App store={store} platform={platform} />);

    const [firstGapItem] = screen.getAllByTestId('gap-item');
    if (!firstGapItem) throw new Error('expected at least one gap item');
    fireEvent.click(firstGapItem);
    fireEvent.click(screen.getByTestId('gaps-fix'));
    expect(store.getState().step).toBe('review');
    const search = screen.getByPlaceholderText('Suchen …') as HTMLInputElement;
    expect(search.value).not.toBe('');

    // Leave review (the stepper) and come back: the earlier fix-in-review search must not
    // still be prefilled for this unrelated arrival.
    fireEvent.click(screen.getByTestId('step-facts'));
    fireEvent.click(screen.getByTestId('step-review'));
    const searchAgain = screen.getByPlaceholderText('Suchen …') as HTMLInputElement;
    expect(searchAgain.value).toBe('');
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

/**
 * A platform whose assist client resolves when the test says so, and whose key store is a
 * variable the test can read. Both assist races are about what happens between the call and
 * the answer, so the answer has to be held open.
 */
function assistHarness() {
  const store = { key: undefined as string | undefined };
  let settle: (text: string) => void = () => undefined;
  const client = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        settle = resolve;
      }),
  );
  const platform = {
    download: vi.fn(),
    clearPersisted: vi.fn(),
    assist: {
      client: () => client,
      defaultModel: () => 'claude-sonnet-5',
      endpointLabel: () => 'a-model-host',
      loadKey: async () => store.key,
      saveKey: async (key: string) => {
        store.key = key;
      },
      clearKey: async () => {
        store.key = undefined;
      },
    },
  };
  return { platform, store, client, settle: (text: string) => settle(text) };
}

/**
 * A store parked on the review screen, ready for an assist run. The second fact carries a label
 * the synonym index does not know, so it survives into the request as `f0` — a fact the
 * deterministic matcher already places confidently is never asked about.
 */
function reviewStore() {
  const outcome: IngestOutcome = {
    summaries: OUTCOME.summaries,
    facts: {
      ...OUTCOME.facts,
      facts: [
        ...OUTCOME.facts.facts,
        {
          id: 'a.csv#1:1',
          label: 'Typbezeichnung laut Werksangabe',
          labelKey: 'typbezeichnung-laut-werksangabe',
          raw: 'MW-EV-2026',
          value: 'MW-EV-2026',
          kind: 'text',
          lang: 'de',
          shape: 'kv',
          source: { file: 'a.csv', page: 1 },
        },
      ],
    },
  };
  let s = reduce(initialState, {
    type: 'setProject',
    project: defaultProject('urn:passwerk:test:1', AT),
    at: AT,
  });
  s = reduce(s, { type: 'filesIngested', ...outcome, at: AT });
  s = reduce(s, { type: 'goTo', step: 'review', at: AT });
  return createStore(s);
}

function startRun(): void {
  fireEvent.click(screen.getByTestId('assist-toggle'));
  fireEvent.change(screen.getByTestId('assist-key'), { target: { value: 'sk-secret' } });
  fireEvent.click(screen.getByTestId('assist-run'));
}

describe('App: the assist while the model is still answering', () => {
  it('does not re-save a key the reviewer unchecked mid-run', async () => {
    const h = assistHarness();
    mount(<App store={reviewStore()} platform={h.platform} />);

    fireEvent.click(screen.getByTestId('assist-toggle'));
    fireEvent.change(screen.getByTestId('assist-key'), { target: { value: 'sk-secret' } });
    fireEvent.click(screen.getByTestId('assist-remember'));
    expect(h.store.key).toBe('sk-secret');
    fireEvent.click(screen.getByTestId('assist-run'));

    // The reviewer changes their mind before the answer comes back.
    fireEvent.click(screen.getByTestId('assist-remember'));
    expect(h.store.key).toBeUndefined();

    await act(async () => {
      h.settle('{"suggestions":[]}');
    });

    // The checkbox is unchecked, so the key must still be gone: an in-flight run is not a
    // licence to write a secret the reviewer has withdrawn consent for (ADR D-038).
    expect(h.store.key).toBeUndefined();
    expect((screen.getByTestId('assist-remember') as HTMLInputElement).checked).toBe(false);
  });

  it('persists the key as soon as it is typed under a ticked box, not at the end of a run', () => {
    const h = assistHarness();
    mount(<App store={reviewStore()} platform={h.platform} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    fireEvent.click(screen.getByTestId('assist-remember'));
    fireEvent.change(screen.getByTestId('assist-key'), { target: { value: 'sk-typed-after' } });
    expect(h.store.key).toBe('sk-typed-after');
  });

  it('discards an answer that arrives after the battery category changed', async () => {
    const h = assistHarness();
    const store = reviewStore();
    mount(<App store={store} platform={h.platform} />);
    startRun();

    // The catalogue the model was given belongs to the old category.
    await act(async () => {
      store.dispatch({
        type: 'setProject',
        project: { ...defaultProject('urn:passwerk:test:1', AT), batteryType: 'LMT' },
        at: AT,
      });
    });
    await act(async () => {
      h.settle('{"suggestions":[{"fact":"f0","attribute":"batteryIdentifier","reason":"x"}]}');
    });

    expect(store.getState().assist).toBeNull();
    expect(screen.getByTestId('assist-error').textContent).toMatch(/chang|geändert/i);
  });

  it('installs an answer when nothing about the project moved', async () => {
    const h = assistHarness();
    const store = reviewStore();
    mount(<App store={store} platform={h.platform} />);
    startRun();
    await act(async () => {
      h.settle('{"suggestions":[{"fact":"f0","attribute":"batteryIdentifier","reason":"x"}]}');
    });
    expect(store.getState().assist?.suggestions).toHaveLength(1);
  });
});
