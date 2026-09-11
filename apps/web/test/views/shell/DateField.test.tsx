/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateField } from '@/views/shell/DateField.tsx';
import { mount } from '../render.tsx';

const field = (value = '') => {
  const onChange = vi.fn();
  mount(
    <DateField
      lang="de"
      id="placed-on-market"
      data-testid="placed-on-market"
      label="In Verkehr bringen"
      value={value}
      onChange={onChange}
    />,
  );
  return { onChange, input: screen.getByTestId('placed-on-market') as HTMLInputElement };
};

describe('DateField', () => {
  it('reports a complete ISO date and keeps an incomplete one to itself', () => {
    const { onChange, input } = field();
    fireEvent.change(input, { target: { value: '2027-0' } });
    expect(onChange).not.toHaveBeenCalled();
    // What the reviewer sees is what they typed, even while it is not a date yet.
    expect(input.value).toBe('2027-0');
    fireEvent.change(input, { target: { value: '2027-13-01' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '2027-03-01' } });
    expect(onChange).toHaveBeenCalledWith('2027-03-01');
  });

  it('reports the empty string when the field is cleared', () => {
    const { onChange, input } = field('2027-03-01');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('opens the calendar and reports the day that is clicked', async () => {
    const { onChange } = field('2027-03-01');
    fireEvent.click(screen.getByTestId('placed-on-market-open'));
    const calendar = await screen.findByTestId('placed-on-market-calendar');
    expect(
      calendar.querySelector('button[data-day="2027-03-01"][data-selected="true"]'),
    ).toBeTruthy();
    const day = calendar.querySelector<HTMLButtonElement>('button[data-day="2027-03-12"]');
    if (!day) throw new Error('12 March 2027 is not in the month the calendar opened on');
    fireEvent.click(day);
    expect(onChange).toHaveBeenCalledWith('2027-03-12');
    await waitFor(() => expect(screen.queryByTestId('placed-on-market-calendar')).toBeNull());
  });
});
