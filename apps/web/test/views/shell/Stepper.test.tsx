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
  it('keeps the current step named on a narrow frame and hides the other names', () => {
    // The German step names need ~875 px of top bar, so at the host's 735 px every name but the
    // current one steps aside (spec 3.1 keeps the numbers-only fallback below 640 px). The
    // breakpoint is a class, not a measurement, so jsdom can check it.
    mount(
      <Stepper lang="de" steps={STEPS} current="review" reachable={() => true} onGo={() => {}} />,
    );
    const named = (id: string) =>
      screen.getByTestId(id).querySelector('span') as HTMLSpanElement | null;
    expect(named('step-review')?.className).toBe('max-[640px]:hidden');
    expect(named('step-project')?.className).toBe('max-[880px]:hidden');
  });
});
