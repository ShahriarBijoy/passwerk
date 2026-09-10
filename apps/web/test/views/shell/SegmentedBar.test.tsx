/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SegmentedBar } from '@/views/shell/SegmentedBar.tsx';
import { mount } from '../render.tsx';

describe('SegmentedBar', () => {
  it('draws the requested number of segments and fills the proportion, rounded down', () => {
    mount(<SegmentedBar filled={15} total={47} segments={20} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('15');
    expect(bar.getAttribute('aria-valuemax')).toBe('47');
    const cells = bar.querySelectorAll('i');
    expect(cells).toHaveLength(20);
    expect([...cells].filter((c) => c.dataset['filled'] === 'true')).toHaveLength(6);
  });
  it('treats a zero total as empty', () => {
    mount(<SegmentedBar filled={0} total={0} segments={8} />);
    expect(screen.getByRole('progressbar').querySelectorAll('i[data-filled="true"]')).toHaveLength(
      0,
    );
  });
});
