/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RowEditor } from '@/views/RowEditor.tsx';
import { mount } from './render.tsx';

describe('RowEditor', () => {
  it('starts with one empty row, refuses a blank required leaf per row, then saves typed rows', () => {
    const onSave = vi.fn();
    mount(<RowEditor lang="en" attributeId="criticalRawMaterials" onSave={onSave} />);
    expect(screen.getAllByTestId('rows-row')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('rows-add'));
    expect(screen.getAllByTestId('rows-row')).toHaveLength(2);
    const field = (row: number, path: string) =>
      screen
        .getAllByTestId('rows-row')
        [row]?.querySelector(`[data-testid="rows-field-${path}"]`) as HTMLInputElement;
    fireEvent.change(field(0, 'name'), { target: { value: 'Lithium' } });
    fireEvent.change(field(0, 'identifier'), { target: { value: '7439-93-2' } });
    fireEvent.change(field(1, 'name'), { target: { value: 'Cobalt' } });
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('rows-error').textContent).toMatch(/Row 2/);
    fireEvent.change(field(1, 'identifier'), { target: { value: '7440-48-4' } });
    // Fixing the failing row's field clears the error immediately, before saving again.
    expect(screen.queryByTestId('rows-error')).toBeNull();
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).toHaveBeenCalledWith([
      { name: 'Lithium', identifier: '7439-93-2' },
      { name: 'Cobalt', identifier: '7440-48-4' },
    ]);
  });
  it('gives each row a unique DOM id, so a label resolves to its own row only', () => {
    mount(<RowEditor lang="en" attributeId="criticalRawMaterials" onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId('rows-add'));
    const inputs = screen.getAllByTestId('rows-field-name') as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    const [row0, row1] = inputs;
    expect(row0?.id).not.toBe(row1?.id);
    // A duplicate id would make `getElementById` (and a real browser's label click-forwarding,
    // which resolves `for` the same way) resolve to the wrong row's input.
    expect(document.getElementById(row1?.id ?? '')).toBe(row1);
    const label1 = document.querySelector(`label[for="${row1?.id}"]`);
    expect(label1?.closest('[data-testid="rows-row"]')).toBe(
      row1?.closest('[data-testid="rows-row"]'),
    );
  });
  it('prefills from an existing value and removes a row', () => {
    const onSave = vi.fn();
    mount(
      <RowEditor
        lang="de"
        attributeId="componentPartNumbers"
        initial={[
          { partName: 'Cell', partNumber: 'C-1' },
          { partName: 'Module', partNumber: 'M-1' },
        ]}
        onSave={onSave}
      />,
    );
    expect(screen.getAllByTestId('rows-row')).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId('rows-remove')[1] as HTMLElement);
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).toHaveBeenCalledWith([{ partName: 'Cell', partNumber: 'C-1' }]);
    expect(screen.getByText('Zeile hinzufügen')).toBeTruthy();
  });
  it('shows a language field the initial value carries beyond de/en, and keeps it on save', () => {
    const onSave = vi.fn();
    mount(
      <RowEditor
        lang="en"
        attributeId="sparePartSources"
        initial={[{ name: { en: 'Plant', fr: 'Usine' } }]}
        onSave={onSave}
      />,
    );
    const frField = screen.getByTestId('rows-field-name.fr') as HTMLInputElement;
    expect(frField.value).toBe('Usine');
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).toHaveBeenCalledWith([{ name: { en: 'Plant', fr: 'Usine' } }]);
  });
  it('renders a list leaf as a textarea and keeps an item containing a comma intact', () => {
    const onSave = vi.fn();
    mount(
      <RowEditor
        lang="en"
        attributeId="hazardousSubstances"
        initial={[
          {
            name: 'Pb',
            identifier: '7439-92-1',
            impacts: ['Harmful if inhaled, swallowed or in contact with skin'],
          },
        ]}
        onSave={onSave}
      />,
    );
    const field = screen.getByTestId('rows-field-impacts');
    expect(field.tagName).toBe('TEXTAREA');
    expect((field as HTMLTextAreaElement).value).toBe(
      'Harmful if inhaled, swallowed or in contact with skin',
    );
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).toHaveBeenCalledWith([
      {
        name: 'Pb',
        identifier: '7439-92-1',
        impacts: ['Harmful if inhaled, swallowed or in contact with skin'],
      },
    ]);
  });
  it('edits nested rows', () => {
    const onSave = vi.fn();
    mount(<RowEditor lang="en" attributeId="sparePartSources" onSave={onSave} />);
    fireEvent.change(screen.getByTestId('rows-field-name.en'), { target: { value: 'Plant' } });
    fireEvent.click(screen.getByTestId('rows-add-components'));
    fireEvent.change(screen.getByTestId('rows-field-components-0-partName'), {
      target: { value: 'Cell' },
    });
    fireEvent.change(screen.getByTestId('rows-field-components-0-partNumber'), {
      target: { value: 'C-1' },
    });
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).toHaveBeenCalledWith([
      { name: { en: 'Plant' }, components: [{ partName: 'Cell', partNumber: 'C-1' }] },
    ]);
  });
});
