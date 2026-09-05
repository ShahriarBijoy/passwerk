/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StartView } from '@/views/StartView.tsx';
import { mount } from './render.tsx';

describe('StartView', () => {
  it('renders in both languages and starts with the chosen category', () => {
    const onStart = vi.fn();
    const props = {
      defaultPassportId: 'urn:passwerk:draft:1',
      onStart,
      onImport: () => ({ ok: true }) as const,
      onResume: () => undefined,
      onReset: () => undefined,
    };
    const { unmount } = mount(<StartView lang="de" {...props} />);
    expect(screen.getByText('Batteriekategorie')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Projekt anlegen' }));
    expect(onStart).toHaveBeenCalledWith({ category: 'EV', passportId: 'urn:passwerk:draft:1' });
    unmount();
    mount(<StartView lang="en" {...props} />);
    expect(screen.getByText('Battery category')).toBeTruthy();
  });

  it('reports a throwing import instead of letting the rejection escape', async () => {
    mount(
      <StartView
        lang="en"
        defaultPassportId="urn:x"
        onStart={() => undefined}
        onImport={() => {
          throw new Error('boom');
        }}
        onResume={() => undefined}
        onReset={() => undefined}
      />,
    );
    fireEvent.change(screen.getByTestId('import-draft'), {
      target: { files: [new File(['{}'], 'draft.json', { type: 'application/json' })] },
    });
    expect((await screen.findByTestId('import-error')).textContent).toContain('boom');
  });

  it('shows the resume card when a session exists', () => {
    mount(
      <StartView
        lang="en"
        defaultPassportId="urn:x"
        resume={{ category: 'LMT', files: ['a.pdf'], updatedAt: '2026-09-05T12:00:00Z' }}
        onStart={() => undefined}
        onImport={() => ({ ok: true })}
        onResume={() => undefined}
        onReset={() => undefined}
      />,
    );
    expect(screen.getByText('Resume last session')).toBeTruthy();
  });
});
