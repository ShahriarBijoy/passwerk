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
  });
});
