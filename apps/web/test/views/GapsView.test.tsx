/** @vitest-environment jsdom */
import { gapReport, getSample, type PassportDraft, validate } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GapsView } from '@/views/GapsView.tsx';
import { mount } from './render.tsx';

const draft = getSample('ev-missing-material-identifier') as PassportDraft;
const report = validate(draft, { asOf: '2026-09-05T12:00:00Z' });
const gap = gapReport(draft, { report, asOf: '2026-09-05T12:00:00Z' });
const props = {
  lang: 'en' as const,
  top: <span />,
  report,
  gap,
  onFixInReview: () => undefined,
  onContinue: () => undefined,
};

describe('GapsView', () => {
  it('shows verdict, completeness and every item, grouped by owner, open ones first', () => {
    mount(<GapsView {...props} />);
    expect(screen.getByTestId('verdict').getAttribute('data-verdict')).toBe('invalid');
    expect(screen.getByTestId('completeness-mandatory').textContent).toContain(
      gap.completeness.mandatory.percent,
    );
    fireEvent.click(screen.getByTestId('gaps-filter-all'));
    expect(screen.getAllByTestId('gap-item')).toHaveLength(gap.items.length);
    expect(screen.getAllByTestId('gap-group')).toHaveLength(gap.byDataOwner.length);
  });
  it('lists the findings under their tab and opens a gap item in the sheet', () => {
    const onFix = vi.fn();
    mount(<GapsView {...props} onFixInReview={onFix} />);
    fireEvent.click(screen.getByTestId('gaps-view-findings'));
    expect(screen.getAllByTestId('finding')).toHaveLength(report.findings.length);
    fireEvent.click(screen.getByTestId('gaps-view-owner'));
    const first = screen.getAllByTestId('gap-item')[0] as HTMLElement;
    fireEvent.click(first);
    const sheet = screen.getByTestId('gaps-sheet');
    expect(sheet.textContent).toContain('Legal basis');
    fireEvent.click(screen.getByTestId('gaps-fix'));
    expect(onFix).toHaveBeenCalledWith(first.getAttribute('data-attribute'));
  });
  it('renders German', () => {
    mount(<GapsView {...props} lang="de" />);
    expect(screen.getByText('Pflichtangaben')).toBeTruthy();
  });
});
