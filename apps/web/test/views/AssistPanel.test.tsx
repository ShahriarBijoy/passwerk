/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistPanel, type AssistPanelProps } from '@/views/AssistPanel.tsx';
import type { AssistState } from '@/workflow/assist/types.ts';
import { mount } from './render.tsx';

const DISCLOSURE = {
  facts: 12,
  proposals: 4,
  catalogue: 80,
  endpoint: 'api.anthropic.com',
  json: '{"category":"EV","facts":[{"id":"f0","label":"Nennspannung"}]}',
};

const RAN: AssistState = {
  runAt: '2026-09-08T10:00:00Z',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  suggestions: [
    {
      factId: 'a.pdf#1:1',
      attributeId: 'nominalVoltage',
      reason: 'Klemmenspannung heisst hier Nennspannung',
    },
  ],
  critiques: [
    { factId: 'a.pdf#1:2', attributeId: 'batteryMass', reason: 'sieht nach Bruttogewicht aus' },
  ],
  discards: [
    {
      kind: 'suggestion',
      reason: 'value-refused',
      attributeId: 'batteryMass',
      factId: 'a.pdf#1:3',
    },
  ],
};

const runButton = () => screen.getByTestId('assist-run') as HTMLButtonElement;

const props = (over: Partial<AssistPanelProps> = {}): AssistPanelProps => ({
  lang: 'en',
  config: { provider: 'anthropic', model: 'claude-sonnet-5', apiKey: '' },
  onConfigChange: vi.fn(),
  remember: false,
  onRememberChange: vi.fn(),
  disclosure: DISCLOSURE,
  assist: null,
  running: false,
  onRun: vi.fn(),
  onCancel: vi.fn(),
  onAccept: vi.fn(),
  onDismiss: vi.fn(),
  ...over,
});

describe('AssistPanel', () => {
  it('states the boundary before anything else: the model never supplies values', () => {
    mount(<AssistPanel {...props()} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(screen.getByTestId('assist-boundary').textContent).toMatch(
      /never from the model|only names attributes/i,
    );
  });

  it('will not run without a key for a hosted provider', () => {
    const onRun = vi.fn();
    mount(<AssistPanel {...props({ onRun })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(runButton().disabled).toBe(true);
    fireEvent.click(screen.getByTestId('assist-run'));
    expect(onRun).not.toHaveBeenCalled();
  });

  it('runs against a local runner with no key at all', () => {
    const onRun = vi.fn();
    mount(
      <AssistPanel
        {...props({
          config: {
            provider: 'openai-compatible',
            model: 'llama3',
            apiKey: '',
            baseUrl: 'http://localhost:11434/v1',
          },
          onRun,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(runButton().disabled).toBe(false);
    fireEvent.click(screen.getByTestId('assist-run'));
    expect(onRun).toHaveBeenCalled();
  });

  it('says what is sent, and shows the literal request on demand', () => {
    mount(<AssistPanel {...props()} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    const summary = screen.getByTestId('assist-disclosure').textContent ?? '';
    expect(summary).toContain('12');
    expect(summary).toContain('api.anthropic.com');
    expect(screen.queryByTestId('assist-request')).toBeNull();

    fireEvent.click(screen.getByTestId('assist-disclosure-toggle'));
    expect(screen.getByTestId('assist-request').textContent).toContain('Nennspannung');
  });

  it('promises that file names and documents stay put', () => {
    mount(<AssistPanel {...props()} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(screen.getByTestId('assist-disclosure').textContent).toMatch(/File names/i);
  });

  it('lists a suggestion with the attribute and the model’s reason', () => {
    mount(<AssistPanel {...props({ assist: RAN })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    const row = screen.getByTestId('assist-suggestion');
    expect(row.textContent).toContain('nominalVoltage');
    expect(row.textContent).toContain('Klemmenspannung heisst hier Nennspannung');
  });

  it('hands the whole suggestion back on accept and on dismiss', () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    mount(<AssistPanel {...props({ assist: RAN, onAccept, onDismiss })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    fireEvent.click(screen.getByTestId('assist-accept'));
    expect(onAccept).toHaveBeenCalledWith(RAN.suggestions[0]);
    fireEvent.click(screen.getByTestId('assist-dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(RAN.suggestions[0]);
  });

  it('shows a discarded answer with the check that refused it', () => {
    mount(<AssistPanel {...props({ assist: RAN })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    const discard = screen.getByTestId('assist-discard');
    expect(discard.textContent).toContain('batteryMass');
    expect(discard.textContent).toMatch(/does not fit/i);
  });

  it('names the model that answered', () => {
    mount(<AssistPanel {...props({ assist: RAN })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(screen.getByTestId('assist-ran-at').textContent).toContain('claude-sonnet-5');
  });

  it('shows the failure rather than an empty panel', () => {
    mount(<AssistPanel {...props({ error: 'api.anthropic.com answered 401' })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(screen.getByTestId('assist-error').textContent).toContain('401');
  });

  it('offers a cancel while a run is in flight', () => {
    const onCancel = vi.fn();
    mount(<AssistPanel {...props({ running: true, onCancel })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    fireEvent.click(screen.getByTestId('assist-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('says there is nothing to ask when nothing is unplaced', () => {
    mount(<AssistPanel {...props({ disclosure: { ...DISCLOSURE, facts: 0, proposals: 0 } })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(screen.getByTestId('assist-nothing')).toBeTruthy();
    expect(runButton().disabled).toBe(true);
  });

  it('warns what remembering the key on this device means', () => {
    const onRememberChange = vi.fn();
    mount(<AssistPanel {...props({ onRememberChange })} />);
    fireEvent.click(screen.getByTestId('assist-toggle'));
    expect(screen.getByTestId('assist-remember-hint').textContent).toMatch(/browser profile/i);
    fireEvent.click(screen.getByTestId('assist-remember'));
    expect(onRememberChange).toHaveBeenCalledWith(true);
  });
});
