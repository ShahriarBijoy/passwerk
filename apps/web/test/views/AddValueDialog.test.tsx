/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddValueDialog } from '@/views/AddValueDialog.tsx';
import { mount } from './render.tsx';

/** Radix's Select ignores a synthetic click; the keyboard path works under jsdom. */
function openSelect(testId: string): void {
  fireEvent.keyDown(screen.getByTestId(testId), { key: 'ArrowDown' });
}

function chooseAttribute(id: string): void {
  openSelect('add-attribute');
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`\\(${id}\\)`) }));
}

describe('AddValueDialog', () => {
  it('enters a composite field by field: a leaf is preselected and there is no whole-value option', () => {
    mount(<AddValueDialog lang="en" category="EV" onAdd={vi.fn()} />);
    fireEvent.click(screen.getByTestId('add-value'));
    chooseAttribute('manufacturerInformation');

    const leaf = screen.getByTestId('add-leaf');
    expect(leaf.textContent).toContain('name.de');
    expect(screen.queryByText('Whole value')).toBeNull();
    openSelect('add-leaf');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('address.cityTown');
    expect(screen.queryByRole('option', { name: 'Whole value' })).toBeNull();
  });

  it('adds the manual decision with the chosen leaf as its path', () => {
    const onAdd = vi.fn();
    mount(<AddValueDialog lang="en" category="EV" onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId('add-value'));
    chooseAttribute('manufacturerInformation');
    fireEvent.change(screen.getByTestId('add-value-input'), { target: { value: 'Musterwerk' } });
    fireEvent.click(screen.getByTestId('add-submit'));
    expect(onAdd).toHaveBeenCalledWith({
      kind: 'manual',
      attributeId: 'manufacturerInformation',
      path: 'name.de',
      value: 'Musterwerk',
    });
  });

  it('shows no leaf select for a plain attribute and still validates its value', () => {
    const onAdd = vi.fn();
    mount(<AddValueDialog lang="en" category="EV" onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId('add-value'));
    chooseAttribute('ratedCapacity');
    expect(screen.queryByTestId('add-leaf')).toBeNull();
    fireEvent.change(screen.getByTestId('add-value-input'), { target: { value: '94,5' } });
    fireEvent.click(screen.getByTestId('add-submit'));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('value-error').textContent).toContain('Rated capacity');
  });
});
