/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App.tsx';
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
