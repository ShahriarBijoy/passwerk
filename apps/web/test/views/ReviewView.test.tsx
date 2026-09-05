/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
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

describe('ReviewView', () => {
  it('renders a group and dispatches accept', () => {
    const onDecide = vi.fn();
    mount(
      <ReviewView
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
      />,
    );
    expect(screen.getByText('94.5')).toBeTruthy();
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
      />,
    );
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
      />,
    );
    const row = screen.getByTestId('invalid-decision');
    expect(row.textContent).toContain('ratedCapacity');
    expect(row.textContent).toContain('expected a decimal string');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledWith('ratedCapacity');
  });

  it('renders a mapping conflict with both values', () => {
    mount(
      <ReviewView
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
    };

    const { unmount } = mount(<ReviewView {...props} groups={groups} onDecide={onDecide} />);
    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.queryByTestId('edit-recorded-at')).toBeNull();
    unmount();

    mount(<ReviewView {...props} groups={dynamic} onDecide={onDecide} />);
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
      />,
    );
    expect(screen.getByText('0 übernommen, 1 offen')).toBeTruthy();
  });
});
