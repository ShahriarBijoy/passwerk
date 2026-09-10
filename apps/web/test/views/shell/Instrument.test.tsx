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
  it('pins its one grid column to the frame width so no region can widen the instrument', () => {
    mount(
      <Instrument top={<b>top</b>} data-testid="instrument">
        <p>list</p>
      </Instrument>,
    );
    const root = screen.getByTestId('instrument');
    // Without an explicit `minmax(0, …)` the implicit column is `auto`, whose minimum is the
    // content's min-content width: a long row or a wide toolbar then makes the whole grid wider
    // than the frame and `overflow-hidden` silently clips it (visual review, task 14).
    expect(root.className).toContain('grid-cols-[minmax(0,1fr)]');
    for (const region of ['top', 'hero', 'toolbar', 'footer']) {
      const el = root.querySelector(`[data-region="${region}"]`);
      expect(el?.className, region).toContain('min-w-0');
    }
  });
});
