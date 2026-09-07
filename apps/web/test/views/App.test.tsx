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

const AT = '2026-09-05T12:00:00Z';

const OUTCOME: IngestOutcome = {
  summaries: [{ name: 'a.csv', size: 3, sha256: 'x', format: 'csv', pages: 1, lang: 'de' }],
  facts: { facts: [], tables: [], documents: [] },
};

describe('App', () => {
  it('starts on the project step, toggles language and starts a project', () => {
    const store = createStore(initialState);
    mount(<App store={store} />);
    expect(screen.getByText('Batteriekategorie')).toBeTruthy();
    fireEvent.click(screen.getByTestId('lang-toggle'));
    expect(screen.getByText('Battery category')).toBeTruthy();
    fireEvent.click(screen.getByTestId('start'));
    expect(store.getState().step).toBe('upload');
    expect(store.getState().project?.batteryType).toBe('EV');
    expect(screen.getByText('Upload documents')).toBeTruthy();
  });
  it('shows the storage notice', () => {
    mount(<App store={createStore(initialState)} storageNotice="version" />);
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
    mount(<App store={store} />);
    fireEvent.click(screen.getByTestId('start'));
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
