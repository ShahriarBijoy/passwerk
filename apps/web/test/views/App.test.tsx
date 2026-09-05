/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App.tsx';
import { ErrorBoundary } from '@/app/ErrorBoundary.tsx';
import { initialState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';
import { mount } from './render.tsx';

describe('App', () => {
  it('starts on the start step, toggles language and starts a project', () => {
    const store = createStore(initialState);
    mount(<App store={store} />);
    expect(screen.getByText('Batteriekategorie')).toBeTruthy();
    fireEvent.click(screen.getByTestId('lang-toggle'));
    expect(screen.getByText('Battery category')).toBeTruthy();
    fireEvent.click(screen.getByTestId('start'));
    expect(store.getState().step).toBe('upload');
    expect(store.getState().meta?.category).toBe('EV');
    expect(screen.getByText('Upload documents')).toBeTruthy();
  });
  it('shows the storage notice', () => {
    mount(<App store={createStore(initialState)} storageNotice="version" />);
    expect(screen.getByTestId('storage-notice')).toBeTruthy();
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
