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
    // The percentage and nothing else: the hero beside it already reads "present / total", and
    // saying it twice in two type sizes is the metadata line's job for neither of them.
    expect(screen.getByTestId('completeness-mandatory').textContent).toBe(
      `${gap.completeness.mandatory.percent} %`,
    );
    expect(screen.getByTestId('completeness-mandatory-hero').textContent).toContain(
      gap.completeness.mandatory.present,
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
  it('links a finding to its attribute even after a nonmatching gap search', () => {
    const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
    const finding = report.findings.find((f) => f.attributeId && byId.has(f.attributeId));
    expect(finding).toBeTruthy();
    const item = byId.get(finding?.attributeId ?? '');
    expect(item).toBeTruthy();
    mount(<GapsView {...props} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'no-matching-attribute' } });
    fireEvent.click(screen.getByTestId('gaps-view-findings'));
    const findingRow = screen
      .getAllByTestId('finding')
      .find((el) => el.getAttribute('data-attribute') === finding?.attributeId) as HTMLElement;
    fireEvent.click(findingRow);
    fireEvent.click(screen.getByTestId('gaps-show-attribute'));
    const sheet = screen.getByTestId('gaps-sheet');
    expect(sheet.textContent).toContain(item?.name.en);
    expect(screen.getByTestId('gaps-view-owner').getAttribute('data-state')).toBe('on');
  });
  it('shows a partly filled composite as partial, with its missing sub-fields in the sheet', () => {
    mount(<GapsView {...props} />);
    const row = screen
      .getAllByTestId('gap-item')
      .find((r) => r.getAttribute('data-attribute') === 'criticalRawMaterials') as HTMLElement;
    expect(row.getAttribute('data-status')).toBe('partial');
    expect(row.textContent).toContain('partial');
    fireEvent.click(row);
    expect(screen.getByTestId('gaps-missing-leaves').textContent).toContain('0.identifier');
    expect(screen.getByTestId('gaps-sheet').textContent).toContain('Missing sub-fields');
  });
  it('renders the partial status in German', () => {
    mount(<GapsView {...props} lang="de" />);
    const row = screen
      .getAllByTestId('gap-item')
      .find((r) => r.getAttribute('data-attribute') === 'criticalRawMaterials') as HTMLElement;
    expect(row.textContent).toContain('unvollständig');
    fireEvent.click(row);
    expect(screen.getByTestId('gaps-sheet').textContent).toContain('Fehlende Teilfelder');
  });
  it('renders German', () => {
    mount(<GapsView {...props} lang="de" />);
    expect(screen.getByText('Pflichtangaben')).toBeTruthy();
  });
  it('writes the not-legal-advice line as a sentence, not as a mono caps label', () => {
    mount(<GapsView {...props} />);
    // A sentence, so Space Grotesk sentence case (`.note`), never the mono caps of a label
    // (spec 2): `.label` upper-cases in CSS, which shouted the whole line.
    const line = screen.getByTestId('not-legal-advice');
    expect(line.className).toContain('note');
    expect(line.className).not.toContain('label');
  });
});
