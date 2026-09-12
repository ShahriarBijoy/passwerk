/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from '@/views/shell/Sheet.tsx';
import { mount } from '../render.tsx';

describe('Sheet', () => {
  it('shows title, position, content and actions; arrows and Escape call back', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();
    mount(
      <Sheet
        lang="en"
        open
        title="Rated capacity"
        meta="BR Annex XIII"
        position={{ index: 2, total: 8 }}
        onPrev={onPrev}
        onNext={onNext}
        onClose={onClose}
        actions={<button type="button">Accept</button>}
        data-testid="sheet"
      >
        <p>body</p>
      </Sheet>,
    );
    const sheet = screen.getByTestId('sheet');
    expect(sheet.textContent).toContain('Rated capacity');
    expect(sheet.textContent).toContain('BR Annex XIII');
    expect(sheet.textContent).toContain('2 of 8');
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
    fireEvent.keyDown(sheet, { key: 'ArrowRight' });
    fireEvent.keyDown(sheet, { key: 'ArrowLeft' });
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    // `duration-200` times the slide. Left alone it also sets `transition-duration` against the
    // initial `transition-property: all`, which re-tweened every colour and edge of the panel on
    // a theme or frame change; the sheet animates in and out and transitions nothing.
    expect(sheet.className).toContain('transition-none');
  });
  it('renders nothing when closed', () => {
    mount(
      <Sheet lang="en" open={false} title="x" onClose={() => undefined} data-testid="sheet">
        <p>b</p>
      </Sheet>,
    );
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('closes on Escape dispatched anywhere in the document, not only on the sheet itself', () => {
    // The regression this covers: focus can land on <body> (a nested dialog closing, or an
    // in-place re-render inside the sheet that unmounts the focused element), which is not a
    // descendant of the sheet's content, so a keydown handler attached only there never sees the
    // key. The sheet's document-level listener (Sheet.tsx's `escapeRef`) must still catch it.
    const onClose = vi.fn();
    mount(
      <Sheet lang="en" open title="Rated capacity" onClose={onClose} data-testid="sheet">
        <p>body</p>
      </Sheet>,
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leaves Escape to a modal dialog stacked above it', () => {
    const onClose = vi.fn();
    mount(
      <>
        {/* Stands in for the row editor / add-value dialog: a real modal open above the sheet. */}
        <div data-slot="dialog-content" data-state="open" />
        <Sheet lang="en" open title="Rated capacity" onClose={onClose} data-testid="sheet">
          <p>body</p>
        </Sheet>
      </>,
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves Escape to an open select or popover stacked above it', () => {
    // The row editor's own selects and DateField's calendar popover can be open above the
    // sheet; Radix's own Escape handling on those should close the dropdown first, not this
    // listener closing the whole sheet out from under it.
    for (const slot of ['select-content', 'popover-content']) {
      const onClose = vi.fn();
      const { unmount } = mount(
        <>
          <div data-slot={slot} data-state="open" />
          <Sheet lang="en" open title="Rated capacity" onClose={onClose} data-testid="sheet">
            <p>body</p>
          </Sheet>
        </>,
      );
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose, slot).not.toHaveBeenCalled();
      unmount();
    }
  });
});
