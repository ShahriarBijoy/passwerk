/** @vitest-environment jsdom */
import type { Fact } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FactsView } from '@/views/FactsView.tsx';
import { mount } from './render.tsx';

/** Radix's Select ignores a synthetic click; the keyboard path works under jsdom. */
function openSelect(testId: string): void {
  fireEvent.keyDown(screen.getByTestId(testId), { key: 'ArrowDown' });
}

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({
  id,
  label: 'Nennkapazität',
  labelKey: 'k',
  raw: '94,5',
  value: '94.5',
  kind: 'decimal',
  unit: 'Ah',
  lang: 'de',
  shape: 'kv',
  source: { file: 'a.pdf', page: 2 },
  ...over,
});

describe('FactsView', () => {
  it('lists facts with provenance and status, edits a value and maps a fact', () => {
    const onEdit = vi.fn();
    const onMap = vi.fn();
    const facts = [
      fact('a'),
      fact('b', { source: { file: 'b.xlsx', cell: 'C3' }, value: '400', unit: 'V' }),
    ];
    mount(
      <FactsView
        lang="en"
        top={<span />}
        facts={facts}
        documents={['a.pdf', 'b.xlsx']}
        edits={{ b: { value: '401', unit: 'V' } }}
        statuses={{ a: { status: 'proposed' }, b: { status: 'unmapped' } }}
        onEdit={onEdit}
        onClearEdit={() => undefined}
        onMap={onMap}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getAllByTestId('fact-row')).toHaveLength(2);
    const rowB = screen.getAllByTestId('fact-row')[1] as HTMLElement;
    expect(rowB.getAttribute('data-status')).toBe('unmapped');
    expect(rowB.querySelector('[data-testid="fact-value"]')?.textContent).toBe('401');
    expect(rowB.querySelector('[data-testid="fact-edited"]')).toBeTruthy();
    fireEvent.click(screen.getAllByTestId('fact-row')[0]!);
    expect(screen.getByText(/Page 2/)).toBeTruthy();
    fireEvent.click(rowB);
    expect(screen.getByText(/Cell C3/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('fact-edit'));
    fireEvent.change(screen.getByTestId('fact-edit-value'), {
      target: { value: '402' },
    });
    fireEvent.click(screen.getByTestId('fact-edit-save'));
    expect(onEdit).toHaveBeenCalledWith('b', { value: '402', unit: 'V' });
    fireEvent.click(screen.getByTestId('fact-map'));
    expect(onMap).toHaveBeenCalledWith(facts[1]);
  });
  it("reopening the editor after a reset shows the fact's original value, not the discarded edit", () => {
    const f = fact('a');
    const props = {
      lang: 'en' as const,
      facts: [f],
      documents: ['a.pdf'],
      statuses: { a: { status: 'unmapped' as const } },
      onEdit: () => undefined,
      onClearEdit: () => undefined,
      onMap: () => undefined,
      onContinue: () => undefined,
    };
    const { rerender } = mount(<FactsView {...props} top={<span />} edits={{}} />);
    fireEvent.click(screen.getByTestId('fact-row'));
    fireEvent.click(screen.getByTestId('fact-edit'));
    fireEvent.change(screen.getByTestId('fact-edit-value'), { target: { value: '999' } });
    fireEvent.click(screen.getByTestId('fact-edit-save'));
    // The reviewer's edit lands in state and is passed back down as a prop.
    rerender(<FactsView {...props} top={<span />} edits={{ a: { value: '999' } }} />);
    fireEvent.click(screen.getByTestId('fact-row'));
    fireEvent.click(screen.getByTestId('fact-edit-reset'));
    // The reset clears it; the parent passes an empty edits map back down.
    rerender(<FactsView {...props} top={<span />} edits={{}} />);
    fireEvent.click(screen.getByTestId('fact-row'));
    fireEvent.click(screen.getByTestId('fact-edit'));
    expect((screen.getByTestId('fact-edit-value') as HTMLInputElement).value).toBe('94.5');
  });
  it('falls back to "all documents" once the selected document disappears from the list', () => {
    const props = {
      lang: 'en' as const,
      top: <span />,
      edits: {},
      onEdit: () => undefined,
      onClearEdit: () => undefined,
      onMap: () => undefined,
      onContinue: () => undefined,
    };
    const a = fact('a');
    const b = fact('b', { source: { file: 'b.xlsx', page: 1 } });
    const { rerender } = mount(
      <FactsView
        {...props}
        facts={[a, b]}
        documents={['a.pdf', 'b.xlsx']}
        statuses={{ a: { status: 'unmapped' }, b: { status: 'unmapped' } }}
      />,
    );
    openSelect('facts-document');
    fireEvent.click(screen.getByRole('option', { name: 'b.xlsx' }));
    expect(screen.getAllByTestId('fact-row')).toHaveLength(1);
    // b.xlsx (and its facts) is removed elsewhere in the app; the filter still names it.
    rerender(
      <FactsView
        {...props}
        facts={[a]}
        documents={['a.pdf']}
        statuses={{ a: { status: 'unmapped' } }}
      />,
    );
    const rows = screen.getAllByTestId('fact-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('data-fact')).toBe('a');
  });
  it('renders German chrome and the count', () => {
    mount(
      <FactsView
        lang="de"
        top={<span />}
        facts={[fact('a')]}
        documents={['a.pdf']}
        edits={{}}
        statuses={{ a: { status: 'unmapped' } }}
        onEdit={() => undefined}
        onClearEdit={() => undefined}
        onMap={() => undefined}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getByText('Fakten')).toBeTruthy();
    expect(screen.getByTestId('facts-count').textContent).toContain('1');
  });
  it('uses the singular form when exactly one fact exists', () => {
    mount(
      <FactsView
        lang="en"
        top={<span />}
        facts={[fact('a')]}
        documents={['a.pdf']}
        edits={{}}
        statuses={{ a: { status: 'unmapped' } }}
        onEdit={() => undefined}
        onClearEdit={() => undefined}
        onMap={() => undefined}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getByTestId('facts-count').textContent).toBe('1 of 1 fact');
    // The four filter names, the document trigger and the search fill the toolbar at the host's
    // 735 px; the count reads from the footer's status slot instead of wrapping the toolbar onto
    // a second line.
    expect(
      screen.getByTestId('facts-count').closest('[data-region]')?.getAttribute('data-region'),
    ).toBe('footer');
    // Mono caps with the active one underlined (spec 3.2), not a filled pill that would be the
    // brightest thing on the screen.
    const tab = screen.getByTestId('facts-status-all');
    expect(tab.className).toContain('border-b-2');
    expect(tab.className).not.toContain('rounded-pill');
  });
});
