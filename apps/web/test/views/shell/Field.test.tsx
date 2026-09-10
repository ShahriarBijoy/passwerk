/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from '@/views/shell/Field.tsx';
import { mount } from '../render.tsx';

describe('Field', () => {
  it('labels its control and shows hint and error', () => {
    mount(
      <Field label="Energy" htmlFor="e" hint="Decimal comma accepted" error="Missing">
        <input id="e" />
      </Field>,
    );
    expect(screen.getByLabelText('Energy')).toBeTruthy();
    expect(screen.getByText('Decimal comma accepted')).toBeTruthy();
    expect(screen.getByText('Missing').className).toContain('text-destructive');
  });
});
