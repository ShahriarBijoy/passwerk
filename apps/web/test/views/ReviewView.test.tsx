/** @vitest-environment jsdom */
import { getSample, type PassportDraft } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewView } from '@/views/ReviewView.tsx';
import { buildGroups } from '@/views/reviewModel.ts';
import { mount } from './render.tsx';

const groups = buildGroups(
  [
    {
      attributeId: 'ratedCapacity',
      value: '94.5',
      unit: 'Ah',
      factId: 'f1',
      confidence: 0.9,
      source: [{ file: 'a.pdf', page: 1 }],
      why: { de: 'Treffer', en: 'Match' },
      checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
    },
  ],
  {},
);

const noArrays = { arrays: [], arrayRows: () => undefined };

describe('ReviewView', () => {
  it('renders a group and dispatches accept', () => {
    const onDecide = vi.fn();
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={onDecide}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    expect(screen.getByText('94.5')).toBeTruthy();
    fireEvent.click(screen.getByTestId('group'));
    expect(screen.getByText('Match')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onDecide).toHaveBeenCalledWith({
      kind: 'accept',
      attributeId: 'ratedCapacity',
      factId: 'f1',
    });
  });
  it('blocks a save whose value core would reject, and does not dispatch', () => {
    const onDecide = vi.fn();
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={onDecide}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    fireEvent.click(screen.getByTestId('group'));
    fireEvent.click(screen.getByTestId('edit'));
    fireEvent.change(screen.getByTestId('edit-value'), { target: { value: '94,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByTestId('value-error').textContent).toContain('Rated capacity');
  });
  it('renders an invalid decision with a clear button', () => {
    const onClear = vi.fn();
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        invalidDecisions={[{ key: 'ratedCapacity', message: 'expected a decimal string' }]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={onClear}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    const row = screen.getByTestId('invalid-decision');
    expect(row.textContent).toContain('ratedCapacity');
    expect(row.textContent).toContain('expected a decimal string');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledWith('ratedCapacity');
  });

  it('renders a bilingual invalid-decision message in the current language', () => {
    const bilingual = { de: 'Erwartet eine Dezimalzahl', en: 'Expected a decimal number' };
    const { unmount } = mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        invalidDecisions={[{ key: 'ratedCapacity', message: bilingual }]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    expect(screen.getByTestId('invalid-decision').textContent).toContain(
      'Expected a decimal number',
    );
    unmount();
    mount(
      <ReviewView
        top={<span />}
        lang="de"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        invalidDecisions={[{ key: 'ratedCapacity', message: bilingual }]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    expect(screen.getByTestId('invalid-decision').textContent).toContain(
      'Erwartet eine Dezimalzahl',
    );
  });

  it('renders a mapping conflict with both values', () => {
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[
          {
            attributeId: 'ratedCapacity',
            existing: '1',
            incoming: '2',
            source: [{ file: 'a.pdf' }],
          },
        ]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    const conflict = screen.getByTestId('conflict');
    expect(conflict.textContent).toContain('ratedCapacity');
    expect(conflict.textContent).toContain('1');
    expect(conflict.textContent).toContain('2');
  });

  it('offers a measured-at field for a dynamic value only, and passes it on as ISO', () => {
    const onDecide = vi.fn();
    const dynamic = buildGroups(
      [
        {
          attributeId: 'stateOfCharge',
          value: '70',
          unit: '%',
          factId: 'f2',
          confidence: 0.9,
          source: [{ file: 'bms.csv', cell: 'B2' }],
          why: { de: 'Treffer', en: 'Match' },
          checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
        },
      ],
      {},
    );
    const props = {
      lang: 'en' as const,
      category: 'EV' as const,
      manual: [],
      conflicts: [],
      accepted: 0,
      pending: 1,
      verdict: 'invalid' as const,
      onClear: () => undefined,
      onContinue: () => undefined,
      ...noArrays,
    };

    const { unmount } = mount(
      <ReviewView top={<span />} {...props} groups={groups} onDecide={onDecide} />,
    );
    fireEvent.click(screen.getByTestId('group'));
    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.queryByTestId('edit-recorded-at')).toBeNull();
    unmount();

    mount(<ReviewView top={<span />} {...props} groups={dynamic} onDecide={onDecide} />);
    fireEvent.click(screen.getByTestId('group'));
    fireEvent.click(screen.getByTestId('edit'));
    const field = screen.getByTestId('edit-recorded-at');
    expect(field.getAttribute('type')).toBe('datetime-local');
    expect(screen.getByText('Measured at')).toBeTruthy();
    fireEvent.change(field, { target: { value: '2026-09-04T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onDecide).toHaveBeenCalledWith({
      kind: 'edit',
      attributeId: 'stateOfCharge',
      factId: 'f2',
      value: '70',
      unit: '%',
      recordedAt: new Date('2026-09-04T10:00').toISOString(),
    });
  });

  it('renders German chrome', () => {
    mount(
      <ReviewView
        top={<span />}
        lang="de"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    expect(screen.getByTestId('review-summary').textContent).toBe('0 übernommen, 1 offen');
  });

  it('lists array values and opens the row editor from an array-edit button', () => {
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={[]}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={0}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        arrays={[
          {
            attributeId: 'criticalRawMaterials',
            name: { de: 'Kritische Rohstoffe', en: 'Critical raw materials' },
            rows: 3,
            origin: 'draft',
          },
        ]}
        arrayRows={() =>
          (getSample('ev-valid') as PassportDraft).attributes['criticalRawMaterials']?.value
        }
      />,
    );
    const entry = screen.getByTestId('array-entry');
    expect(entry.textContent).toContain('3 rows');
    fireEvent.click(entry);
    fireEvent.click(screen.getByTestId('array-edit'));
    expect(screen.getAllByTestId('rows-row')).toHaveLength(3);
  });

  it('uses the singular form for a single row', () => {
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={[]}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={0}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        arrays={[
          {
            attributeId: 'criticalRawMaterials',
            name: { de: 'Kritische Rohstoffe', en: 'Critical raw materials' },
            rows: 1,
            origin: 'draft',
          },
        ]}
        arrayRows={() => []}
      />,
    );
    const entry = screen.getByTestId('array-entry');
    expect(entry.textContent).toContain('1 row');
    expect(entry.textContent).not.toContain('1 rows');
  });

  it('marks a proposal the assist flagged, without changing its state', () => {
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={1}
        verdict="invalid"
        critiques={[
          { factId: 'f1', attributeId: 'ratedCapacity', reason: 'looks like the C/3 capacity' },
        ]}
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    fireEvent.click(screen.getByTestId('group'));
    const chip = screen.getByTestId('assist-critique-chip');
    expect(chip.textContent).toContain('looks like the C/3 capacity');
    // A second opinion is a prompt to the reviewer, never a decision.
    expect(screen.getByTestId('proposal').dataset['state']).toBe('pending');
  });

  it('leaves a proposal alone when the critique is about another one', () => {
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={1}
        verdict="invalid"
        critiques={[{ factId: 'f9', attributeId: 'batteryMass', reason: 'nope' }]}
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    fireEvent.click(screen.getByTestId('group'));
    expect(screen.queryByTestId('assist-critique-chip')).toBeNull();
  });

  it('walks the pending queue with next and keeps the list', () => {
    const two = buildGroups(
      [
        { ...groups[0]!.proposals[0]!, attributeId: 'ratedCapacity', factId: 'f1' },
        {
          ...groups[0]!.proposals[0]!,
          attributeId: 'batteryMass',
          factId: 'f2',
          value: '412',
          unit: 'kg',
        },
      ],
      {},
    );
    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={two}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={2}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    fireEvent.click(screen.getAllByTestId('group')[0]!);
    expect(screen.getByTestId('review-sheet').textContent).toContain('1 of 2');
    fireEvent.keyDown(screen.getByTestId('review-sheet'), { key: 'ArrowRight' });
    expect(screen.getByTestId('review-sheet').textContent).toContain('2 of 2');
    expect(screen.getAllByTestId('group')).toHaveLength(2);
  });

  it('starts the search from initialSearch, and shows the empty state when nothing matches it', () => {
    const { unmount } = mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        initialSearch="Rated"
        {...noArrays}
      />,
    );
    expect(screen.getByTestId('group')).toBeTruthy();
    unmount();

    mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={groups}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={1}
        verdict="invalid"
        onDecide={() => undefined}
        onClear={() => undefined}
        onContinue={() => undefined}
        initialSearch="zzz"
        {...noArrays}
      />,
    );
    expect(screen.queryByTestId('group')).toBeNull();
    expect(screen.getByText('No proposals for this filter.')).toBeTruthy();
  });

  it('advances the sheet to the next group when a decision drops the open one from the filter', () => {
    const onDecide = vi.fn();
    const proposals = [
      { ...groups[0]!.proposals[0]!, attributeId: 'ratedCapacity', factId: 'f1' },
      {
        ...groups[0]!.proposals[0]!,
        attributeId: 'batteryMass',
        factId: 'f2',
        value: '412',
        unit: 'kg',
      },
    ];
    const two = buildGroups(proposals, {});
    const { rerender } = mount(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={two}
        manual={[]}
        conflicts={[]}
        accepted={0}
        pending={2}
        verdict="invalid"
        onDecide={onDecide}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    // `buildGroups` sorts alphabetically by attributeId, so `batteryMass` opens first.
    fireEvent.click(screen.getAllByTestId('group')[0]!);
    fireEvent.click(screen.getByTestId('accept'));
    expect(onDecide).toHaveBeenCalledWith({
      kind: 'accept',
      attributeId: 'batteryMass',
      factId: 'f2',
    });

    const decided = buildGroups(proposals, {
      batteryMass: { kind: 'accept', attributeId: 'batteryMass', factId: 'f2' },
    });
    rerender(
      <ReviewView
        top={<span />}
        lang="en"
        category="EV"
        groups={decided}
        manual={[]}
        conflicts={[]}
        accepted={1}
        pending={1}
        verdict="invalid"
        onDecide={onDecide}
        onClear={() => undefined}
        onContinue={() => undefined}
        {...noArrays}
      />,
    );
    const sheet = screen.getByTestId('review-sheet');
    expect(sheet.textContent).toContain('Rated capacity');
    expect(sheet.textContent).toContain('1 of 1');
  });

  it('toggling ASSIST closes a row sheet that was open, so the assist sheet actually shows', () => {
    function Harness() {
      const [assistOpen, setAssistOpen] = useState(false);
      return (
        <ReviewView
          top={<span />}
          lang="en"
          category="EV"
          groups={groups}
          manual={[]}
          conflicts={[]}
          accepted={0}
          pending={1}
          verdict="invalid"
          onDecide={() => undefined}
          onClear={() => undefined}
          onContinue={() => undefined}
          assistPanel={<p>assist panel</p>}
          assistOpen={assistOpen}
          onAssistToggle={() => setAssistOpen((o) => !o)}
          {...noArrays}
        />
      );
    }
    mount(<Harness />);
    fireEvent.click(screen.getByTestId('group'));
    expect(screen.getByTestId('review-sheet')).toBeTruthy();

    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(screen.queryByTestId('review-sheet')).toBeNull();
    expect(screen.getByTestId('assist-sheet').textContent).toContain('assist panel');
  });
});
