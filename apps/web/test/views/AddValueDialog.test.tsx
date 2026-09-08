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

  it('asks for a measured-at timestamp on a dynamic attribute only', () => {
    const onAdd = vi.fn();
    const { unmount } = mount(<AddValueDialog lang="en" category="EV" onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId('add-value'));
    chooseAttribute('ratedCapacity');
    expect(screen.queryByTestId('add-recorded-at')).toBeNull();
    unmount();

    mount(<AddValueDialog lang="en" category="EV" onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId('add-value'));
    chooseAttribute('stateOfCharge');
    const field = screen.getByTestId('add-recorded-at');
    expect(field.getAttribute('type')).toBe('datetime-local');
    fireEvent.change(screen.getByTestId('add-value-input'), { target: { value: '80' } });
    fireEvent.change(field, { target: { value: '2026-09-04T10:00' } });
    fireEvent.click(screen.getByTestId('add-submit'));
    expect(onAdd).toHaveBeenCalledWith({
      kind: 'manual',
      attributeId: 'stateOfCharge',
      value: '80',
      recordedAt: new Date('2026-09-04T10:00').toISOString(),
    });
  });

  it('enters an array composite through the row editor, not the plain value input', () => {
    const onAdd = vi.fn();
    mount(<AddValueDialog lang="en" category="EV" onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId('add-value'));
    chooseAttribute('criticalRawMaterials');
    expect(screen.getAllByTestId('rows-row')).toHaveLength(1);
    expect(screen.queryByTestId('add-value-input')).toBeNull();
    fireEvent.change(screen.getByTestId('rows-field-name'), { target: { value: 'Li' } });
    fireEvent.change(screen.getByTestId('rows-field-identifier'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onAdd).toHaveBeenCalledWith({
      kind: 'manual',
      attributeId: 'criticalRawMaterials',
      value: [{ name: 'Li', identifier: 'x' }],
    });
  });

  it('prefills the row editor from arrayRows so existing rows are not silently replaced', () => {
    const onAdd = vi.fn();
    const arrayRows = vi.fn(() => [
      { name: 'Lithium', identifier: '7439-93-2' },
      { name: 'Cobalt', identifier: '7440-48-4' },
    ]);
    mount(<AddValueDialog lang="en" category="EV" onAdd={onAdd} arrayRows={arrayRows} />);
    fireEvent.click(screen.getByTestId('add-value'));
    chooseAttribute('criticalRawMaterials');
    expect(screen.getAllByTestId('rows-row')).toHaveLength(2);
    expect(arrayRows).toHaveBeenCalledWith('criticalRawMaterials');
  });

  it('prefills from a mapped fact and keeps the factId on the manual decision', () => {
    const onAdd = vi.fn();
    mount(
      <AddValueDialog
        lang="en"
        category="EV"
        onAdd={onAdd}
        open
        prefill={{ factId: 'a.pdf#1:0', value: '400', unit: 'V' }}
        hideTrigger
      />,
    );
    chooseAttribute('nominalVoltage');
    fireEvent.click(screen.getByTestId('add-submit'));
    expect(onAdd).toHaveBeenCalledWith({
      kind: 'manual',
      attributeId: 'nominalVoltage',
      value: '400',
      unit: 'V',
      factId: 'a.pdf#1:0',
    });
  });

  it('keeps the prefill factId on an array-composite decision, so the mapped fact shows as mapped', () => {
    const onAdd = vi.fn();
    mount(
      <AddValueDialog
        lang="en"
        category="EV"
        onAdd={onAdd}
        open
        prefill={{ factId: 'a.pdf#1:0', value: 'Li' }}
        hideTrigger
      />,
    );
    chooseAttribute('criticalRawMaterials');
    fireEvent.change(screen.getByTestId('rows-field-name'), { target: { value: 'Li' } });
    fireEvent.change(screen.getByTestId('rows-field-identifier'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onAdd).toHaveBeenCalledWith({
      kind: 'manual',
      attributeId: 'criticalRawMaterials',
      factId: 'a.pdf#1:0',
      value: [{ name: 'Li', identifier: 'x' }],
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
