/** @vitest-environment jsdom */
import { gapReport, getSample, type PassportDraft, validate } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GapsExportView } from '@/views/GapsExportView.tsx';
import { mount } from './render.tsx';

const draft = getSample('ev-missing-material-identifier') as PassportDraft;
const report = validate(draft, { asOf: '2026-09-05T12:00:00Z' });
const gap = gapReport(draft, { report, asOf: '2026-09-05T12:00:00Z' });

describe('GapsExportView', () => {
  it('shows verdict, completeness, items and export buttons', () => {
    const onExport = vi.fn();
    mount(<GapsExportView lang="en" report={report} gap={gap} onExport={onExport} />);
    expect(screen.getByTestId('verdict').getAttribute('data-verdict')).toBe('invalid');
    expect(screen.getByTestId('completeness-mandatory').textContent).toContain(
      gap.completeness.mandatory.percent,
    );
    expect(screen.getAllByTestId('gap-item').length).toBe(gap.items.length);
    fireEvent.click(screen.getByRole('button', { name: 'AASX' }));
    expect(onExport).toHaveBeenCalledWith('aasx');
    expect(screen.getByText('Not legal advice. Sources are given on every entry.')).toBeTruthy();
  });
  it('renders German', () => {
    mount(<GapsExportView lang="de" report={report} gap={gap} onExport={() => undefined} />);
    expect(screen.getByText('Pflichtangaben')).toBeTruthy();
  });
});
