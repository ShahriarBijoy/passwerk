/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GroupHeader } from '@/views/shell/GroupHeader.tsx';
import { mount } from '../render.tsx';

describe('GroupHeader', () => {
  it('shows the name and the count, reports whether it is open, and toggles on click', () => {
    const onToggle = vi.fn();
    mount(
      <GroupHeader
        name="Battery management system counters"
        count="4 open"
        open
        onToggle={onToggle}
        data-testid="group-header"
      />,
    );
    const header = screen.getByTestId('group-header');
    expect(header.textContent).toContain('Battery management system counters');
    expect(header.textContent).toContain('4 open');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('marks itself closed when it is closed', () => {
    mount(<GroupHeader name="x" count="1 open" open={false} onToggle={() => {}} data-testid="g" />);
    expect(screen.getByTestId('g').getAttribute('aria-expanded')).toBe('false');
  });

  it('lights up under the pointer and shows a keyboard focus in both themes', () => {
    mount(<GroupHeader name="x" count="1 open" open onToggle={() => {}} data-testid="g" />);
    // A group header is a control and had no hover at all. `--surface-raised` is the hover
    // surface the token table names (spec 4.1); `--surface` is white in light mode, a tenth of a
    // step from the page behind it. The focus indicator is an outline, never a ring: Tailwind's
    // ring is a box-shadow and the design spec has no shadow anywhere (4.3).
    const cls = screen.getByTestId('g').className;
    expect(cls).toContain('hover:bg-surface-raised');
    expect(cls).toContain('focus-visible:bg-surface-raised');
    expect(cls).toContain('focus-visible:outline-border-visible');
    expect(cls).not.toContain('ring');
  });

  it('lets only the name shrink, so the count and the chevron stay put', () => {
    mount(
      <GroupHeader
        name="A data owner whose name is a whole sentence"
        count="12 open"
        open={false}
        onToggle={() => {}}
        data-testid="g"
      />,
    );
    const header = screen.getByTestId('g');
    const name = header.querySelector('span.truncate');
    expect(name?.className).toContain('min-w-0');
    expect(name?.className).toContain('flex-1');
    for (const el of Array.from(header.children)) {
      if (el === name) continue;
      expect(el.className, el.textContent ?? '').toContain('shrink-0');
    }
  });
});
