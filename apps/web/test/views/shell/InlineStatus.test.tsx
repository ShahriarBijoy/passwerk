/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineStatus } from '@/views/shell/InlineStatus.tsx';
import { mount } from '../render.tsx';

describe('InlineStatus', () => {
  it('highlights an emphasised line by kind, so a saved path stands out (ADR D-045)', () => {
    mount(<InlineStatus kind="ok" text="Saved to /work/x.json." emphasis data-testid="saved" />);
    const el = screen.getByTestId('saved');
    expect(el.getAttribute('data-emphasis')).toBe('true');
    expect(el.className).toContain('text-success');
    expect(el.className).toContain('bg-success/10');
  });

  it('keeps a plain line plain', () => {
    mount(<InlineStatus kind="ok" text="Copied" data-testid="plain" />);
    const el = screen.getByTestId('plain');
    expect(el.getAttribute('data-emphasis')).toBeNull();
    expect(el.className).not.toContain('bg-success/10');
  });

  it('brackets the kind and shows the text with role=status', () => {
    mount(<InlineStatus kind="error" text="body too large" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.textContent).toBe('[ERROR] body too large');
    expect(el.getAttribute('data-kind')).toBe('error');
    // The bracketed word is a label and is upper-cased by `.label`; the message is a sentence a
    // person reads, and a sentence is never mono caps (spec 2).
    expect(el.querySelector('.normal-case')?.textContent).toBe('body too large');
  });
});
