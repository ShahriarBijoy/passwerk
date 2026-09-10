/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UploadView } from '@/views/UploadView.tsx';
import { mount } from './render.tsx';

describe('UploadView', () => {
  it('lists files with format, pages, language or error, and continues', () => {
    const onContinue = vi.fn();
    mount(
      <UploadView
        top={<span />}
        lang="en"
        busy={false}
        proposalCount={7}
        files={[
          { name: 'a.pdf', size: 10, sha256: 'x', format: 'pdf', pages: 2, lang: 'de' },
          {
            name: 'b.bin',
            size: 10,
            sha256: 'y',
            format: 'unsupported',
            pages: 0,
            lang: 'de',
            error: { code: 'unsupported', message: 'nope' },
          },
        ]}
        onFiles={() => undefined}
        onRemove={() => undefined}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText('a.pdf')).toBeTruthy();
    expect(screen.getByText('Unsupported format')).toBeTruthy();
    const continueButton = screen.getByTestId('continue');
    expect(continueButton.textContent).toContain('7 proposals');
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalled();
  });

  it('uses the singular form for a single proposal', () => {
    mount(
      <UploadView
        top={<span />}
        lang="en"
        busy={false}
        proposalCount={1}
        files={[]}
        onFiles={() => undefined}
        onRemove={() => undefined}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getByTestId('continue').textContent).toContain('1 proposal');
  });

  it('passes chosen files to onFiles', () => {
    const onFiles = vi.fn();
    mount(
      <UploadView
        top={<span />}
        lang="de"
        busy={false}
        proposalCount={0}
        files={[]}
        onFiles={onFiles}
        onRemove={() => undefined}
        onContinue={() => undefined}
      />,
    );
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['x'], 'c.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('shows the busy state as an inline status', () => {
    mount(
      <UploadView
        top={<span />}
        lang="en"
        busy
        proposalCount={0}
        files={[]}
        onFiles={() => undefined}
        onRemove={() => undefined}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getByTestId('upload-busy')).toBeTruthy();
  });

  it('shows the shell error inline when idle', () => {
    mount(
      <UploadView
        top={<span />}
        lang="en"
        busy={false}
        proposalCount={0}
        files={[]}
        error="body too large"
        onFiles={() => undefined}
        onRemove={() => undefined}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getByTestId('upload-error').textContent).toContain('body too large');
  });
});
