/** @vitest-environment jsdom */
import { gapReport, getSample, type PassportDraft, validate } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExportView } from '@/views/ExportView.tsx';
import { mount } from './render.tsx';

const draft = getSample('ev-missing-material-identifier') as PassportDraft;
const report = validate(draft, { asOf: '2026-09-05T12:00:00Z' });
const gap = gapReport(draft, { report, asOf: '2026-09-05T12:00:00Z' });
const ok = {
  ok: true as const,
  svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  payload: 'https://p.example/1',
};

describe('ExportView', () => {
  it('states the verdict once, lists five files and the QR', () => {
    const onExport = vi.fn();
    mount(
      <ExportView
        lang="en"
        top={<span />}
        report={report}
        gap={gap}
        carrier={ok}
        onExport={onExport}
      />,
    );
    expect(screen.getByTestId('verdict').getAttribute('data-verdict')).toBe('invalid');
    for (const k of ['aasJson', 'aasx', 'html', 'gaps', 'draft'])
      fireEvent.click(screen.getByTestId(`export-${k}`));
    expect(onExport.mock.calls.map((c) => c[0])).toEqual([
      'aasJson',
      'aasx',
      'html',
      'gaps',
      'draft',
    ]);
    fireEvent.click(screen.getByTestId('qr-download'));
    expect(onExport).toHaveBeenLastCalledWith('qr');
    expect(screen.getByTestId('not-legal-advice')).toBeTruthy();
  });
  it('shows the reason when there is no QR, and the export error inline', () => {
    mount(
      <ExportView
        lang="en"
        top={<span />}
        report={report}
        gap={gap}
        carrier={{ ok: false, message: { de: 'kein', en: 'none' } }}
        exportError={{ de: 'kaputt', en: 'broken' }}
        onExport={() => undefined}
      />,
    );
    expect(screen.getByTestId('qr-none').textContent).toContain('none');
    expect(screen.getByTestId('export-error').textContent).toContain('broken');
  });
});
