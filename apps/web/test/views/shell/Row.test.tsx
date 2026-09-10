/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Row } from '@/views/shell/Row.tsx';
import { mount } from '../render.tsx';

describe('Row', () => {
  it('shows name, value, unit and tags, passes data attributes and opens on click or Enter', () => {
    const onOpen = vi.fn();
    mount(
      <Row
        name="Rated capacity"
        value="75"
        unit="Ah"
        tags={[{ label: 'accepted', tone: 'success' }]}
        dot="ok"
        onOpen={onOpen}
        data-testid="row"
        data-key="ratedCapacity"
      />,
    );
    const row = screen.getByTestId('row');
    expect(row.getAttribute('data-key')).toBe('ratedCapacity');
    expect(row.textContent).toContain('Rated capacity');
    expect(row.textContent).toContain('75');
    expect(row.textContent).toContain('Ah');
    expect(row.textContent).toContain('accepted');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
  it('lets only the name shrink: value, unit, tags and chevron keep their width', () => {
    mount(
      <Row
        name="A very long attribute name that has to give way"
        value="75"
        unit="Ah"
        tags={[{ label: 'accepted', tone: 'success' }]}
        onOpen={() => {}}
        data-testid="row"
      />,
    );
    const row = screen.getByTestId('row');
    const name = row.querySelector('span.truncate');
    expect(name?.className).toContain('min-w-0');
    expect(name?.className).toContain('flex-1');
    for (const el of Array.from(row.children)) {
      if (el === name) continue;
      expect(el.className, el.textContent ?? '').toContain('shrink-0');
    }
  });
  it('is a plain div without a click handler when it cannot open', () => {
    mount(<Row name="x" data-testid="row" />);
    expect(screen.getByTestId('row').getAttribute('role')).toBeNull();
  });
});
