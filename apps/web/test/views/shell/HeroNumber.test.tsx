/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroNumber } from '@/views/shell/HeroNumber.tsx';
import { mount } from '../render.tsx';

describe('HeroNumber', () => {
  it('renders label, value and unit, and carries data attributes', () => {
    mount(<HeroNumber label="Mandatory" value="15" unit="/ 47" data-testid="hero" tone="accent" />);
    const el = screen.getByTestId('hero');
    expect(el.textContent).toContain('15');
    expect(el.textContent).toContain('/ 47');
    expect(el.getAttribute('data-tone')).toBe('accent');
    expect(screen.getByText('Mandatory').className).toContain('label');
    expect(screen.getByText('15').className).toContain('text-[40px]');
  });
  it('steps a multi-word value down a size and keeps it on one line', () => {
    // Doto never renders more than one word at the full 40 px (spec 4.2), and the German
    // obligation verdict is three words: at 40 px it wrapped into a second row of dot matrix.
    mount(<HeroNumber label="Obligation" value="Kein Pass erforderlich" data-testid="hero" />);
    const value = screen.getByText('Kein Pass erforderlich');
    expect(value.className).toContain('text-[26px]');
    expect(value.className).not.toContain('text-[40px]');
    // `truncate` carries `white-space: nowrap`, so the phrase stays on one line whatever room it
    // is given, and can never escape the frame.
    expect(value.className).toContain('truncate');
  });
});
