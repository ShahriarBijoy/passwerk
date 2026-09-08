/** @vitest-environment jsdom */
import type { Fact } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FactsView } from '@/views/FactsView.tsx';
import { mount } from './render.tsx';

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
    expect(screen.getByText(/Page 2/)).toBeTruthy();
    expect(screen.getByText(/Cell C3/)).toBeTruthy();
    const rowB = screen.getAllByTestId('fact-row')[1] as HTMLElement;
    expect(rowB.getAttribute('data-status')).toBe('unmapped');
    expect(rowB.querySelector('[data-testid="fact-value"]')?.textContent).toBe('401');
    expect(rowB.querySelector('[data-testid="fact-edited"]')).toBeTruthy();
    fireEvent.click(rowB.querySelector('[data-testid="fact-edit"]') as HTMLElement);
    fireEvent.change(rowB.querySelector('[data-testid="fact-edit-value"]') as HTMLElement, {
      target: { value: '402' },
    });
    fireEvent.click(rowB.querySelector('[data-testid="fact-edit-save"]') as HTMLElement);
    expect(onEdit).toHaveBeenCalledWith('b', { value: '402', unit: 'V' });
    fireEvent.click(rowB.querySelector('[data-testid="fact-map"]') as HTMLElement);
    expect(onMap).toHaveBeenCalledWith(facts[1]);
  });
  it('renders German chrome and the count', () => {
    mount(
      <FactsView
        lang="de"
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
    expect(screen.getByText('Extrahierte Fakten')).toBeTruthy();
    expect(screen.getByTestId('facts-count').textContent).toContain('1');
  });
});
