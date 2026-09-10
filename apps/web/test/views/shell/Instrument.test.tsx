/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Instrument } from '@/views/shell/Instrument.tsx';
import { mount } from '../render.tsx';

describe('Instrument', () => {
  it('lays out top, hero, toolbar, list, footer and sheet inside one fixed-height frame', () => {
    mount(
      <Instrument
        top={<b>top</b>}
        hero={<i>hero</i>}
        toolbar={<u>bar</u>}
        footer={<s>foot</s>}
        sheet={<em>sheet</em>}
        data-testid="instrument"
      >
        <p>list</p>
      </Instrument>,
    );
    const root = screen.getByTestId('instrument');
    expect(root.style.height).toBe('var(--instrument-height)');
    expect(root.querySelector('[data-region="top"]')?.textContent).toBe('top');
    expect(root.querySelector('[data-region="hero"]')?.textContent).toBe('hero');
    expect(root.querySelector('[data-region="toolbar"]')?.textContent).toBe('bar');
    expect(root.querySelector('[data-region="list"]')?.textContent).toBe('list');
    expect(root.querySelector('[data-region="footer"]')?.textContent).toBe('foot');
    expect(root.querySelector('[data-region="sheet"]')?.textContent).toBe('sheet');
  });
});
