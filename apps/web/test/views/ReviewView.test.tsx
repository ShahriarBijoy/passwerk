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
