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
    fireEvent.click(screen.getByRole('button', { name: 'Continue to facts (7 proposals)' }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('passes chosen files to onFiles', () => {
    const onFiles = vi.fn();
    mount(
      <UploadView
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
});
