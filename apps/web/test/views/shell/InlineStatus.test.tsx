/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineStatus } from '@/views/shell/InlineStatus.tsx';
import { mount } from '../render.tsx';

describe('InlineStatus', () => {
  it('brackets the kind and shows the text with role=status', () => {
    mount(<InlineStatus kind="error" text="body too large" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.textContent).toBe('[ERROR] body too large');
    expect(el.getAttribute('data-kind')).toBe('error');
  });
});
