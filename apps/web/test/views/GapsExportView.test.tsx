/** @vitest-environment jsdom */
import { gapReport, getSample, type PassportDraft, validate } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GapsExportView } from '@/views/GapsExportView.tsx';
import { mount } from './render.tsx';

const draft = getSample('ev-missing-material-identifier') as PassportDraft;
const report = validate(draft, { asOf: '2026-09-05T12:00:00Z' });
const gap = gapReport(draft, { report, asOf: '2026-09-05T12:00:00Z' });

const props = { lang: 'en' as const, report, gap };

describe('GapsExportView', () => {
  it('shows verdict, completeness, items and export buttons', () => {
    const onExport = vi.fn();
    mount(
      <GapsExportView
        {...props}
        onExport={onExport}
        carrier={{
          ok: true,
          svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
          payload: 'https://p.example/1',
        }}
      />,
    );
    expect(screen.getByTestId('verdict').getAttribute('data-verdict')).toBe('invalid');
    expect(screen.getByTestId('completeness-mandatory').textContent).toContain(
      gap.completeness.mandatory.percent,
    );
    expect(screen.getAllByTestId('gap-item').length).toBe(gap.items.length);
    fireEvent.click(screen.getByRole('button', { name: 'AASX' }));
    expect(onExport).toHaveBeenCalledWith('aasx');
    expect(screen.getByText('Not legal advice. Sources are given on every entry.')).toBeTruthy();
  });
  it('shows the QR preview beside the export bar, or the reason there is none', () => {
    const onExport = vi.fn();
    const { unmount } = mount(
      <GapsExportView
        {...props}
        carrier={{
          ok: true,
          svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
          payload: 'https://p.example/1',
        }}
        onExport={onExport}
      />,
    );
    expect(screen.getByTestId('qr-image')).toBeTruthy();
    fireEvent.click(screen.getByTestId('qr-download'));
    expect(onExport).toHaveBeenCalledWith('qr');
    unmount();
    mount(
      <GapsExportView
        {...props}
        carrier={{ ok: false, message: { de: 'kein', en: 'none' } }}
        onExport={onExport}
      />,
    );
    expect(screen.getByTestId('qr-none').textContent).toContain('none');
    expect(screen.queryByTestId('export-qr')).toBeNull();
  });
  it('renders German', () => {
    mount(
      <GapsExportView
        {...props}
        lang="de"
        carrier={{
          ok: true,
          svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
          payload: 'https://p.example/1',
        }}
        onExport={() => undefined}
      />,
    );
    expect(screen.getByText('Pflichtangaben')).toBeTruthy();
  });
});
