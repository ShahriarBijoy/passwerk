/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from '@/views/shell/Stepper.tsx';
import { STEPS } from '@/workflow/state.ts';
import { mount } from '../render.tsx';

describe('Stepper', () => {
  it('numbers the six steps, marks the current one and disables unreachable ones', () => {
    const onGo = vi.fn();
    mount(
      <Stepper
        lang="en"
        steps={STEPS}
        current="review"
        reachable={(s) => s !== 'export'}
        onGo={onGo}
      />,
    );
    expect(screen.getByTestId('step-project').textContent).toBe('01 Project');
    expect(screen.getByTestId('step-review').getAttribute('aria-current')).toBe('step');
    expect((screen.getByTestId('step-export') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('step-gaps'));
    expect(onGo).toHaveBeenCalledWith('gaps');
  });
});
