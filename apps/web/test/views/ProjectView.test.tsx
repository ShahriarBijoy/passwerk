/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '@/views/ProjectView.tsx';
import { deriveProject } from '@/workflow/derive/project.ts';
import { defaultProject, type Project } from '@/workflow/project.ts';
import { mount } from './render.tsx';

// After the 2027-02-18 obligation start, so an EV manufacturer reads "required".
const AT = '2027-09-07T12:00:00Z';
const EARLY = '2026-09-07T12:00:00Z';
const base = defaultProject('urn:passwerk:draft:1', AT);

const DRAFT_URN = 'urn:passwerk:draft:placeholder';

function view(project: Project, over: Partial<Parameters<typeof ProjectView>[0]> = {}) {
  const onChange = vi.fn();
  const onContinue = vi.fn();
  const el = (
    <ProjectView
      lang="en"
      project={project}
      derived={deriveProject(project, AT)}
      isNew
      draftUrn={DRAFT_URN}
      onChange={onChange}
      onContinue={onContinue}
      onImport={() => ({ ok: true })}
      onResume={() => undefined}
      onReset={() => undefined}
      {...over}
    />
  );
  return { ...mount(el), onChange, onContinue };
}

describe('ProjectView', () => {
  it('shows the verdict, the derived category and enables Continue for an EV manufacturer', () => {
    const { onContinue } = view(base);
    expect(screen.getByTestId('obligation-verdict').getAttribute('data-verdict')).toBe('required');
    expect(screen.getByTestId('obligation-category').textContent).toContain(
      'Electric vehicle (EV)',
    );
    expect(screen.queryByTestId('manual-category')).toBeNull();
    expect(screen.getAllByTestId('timeline-entry').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('project-continue'));
    expect(onContinue).toHaveBeenCalled();
  });
  it('before the start date: not required, category still derived, Continue enabled', () => {
    const { onContinue } = view(base, { derived: deriveProject(base, EARLY) });
    expect(screen.getByTestId('obligation-verdict').getAttribute('data-verdict')).toBe(
      'not_required',
    );
    expect(screen.getByTestId('obligation-reason').textContent).toContain('2027-02-18');
    expect(screen.getByTestId('obligation-category').textContent).toContain(
      'Electric vehicle (EV)',
    );
    expect(screen.queryByTestId('manual-category')).toBeNull();
    fireEvent.click(screen.getByTestId('project-continue'));
    expect(onContinue).toHaveBeenCalled();
  });
  it('energy input normalises a decimal comma and dispatches onChange', () => {
    const { onChange } = view({ ...base, batteryType: 'INDUSTRIAL' });
    expect(screen.getByTestId('obligation-verdict').getAttribute('data-verdict')).toBe(
      'insufficient_input',
    );
    expect(screen.getByText(/Missing: battery energy/)).toBeTruthy();
    fireEvent.change(screen.getByTestId('energy-kwh'), { target: { value: '1,5' } });
    expect(onChange).toHaveBeenCalledWith({ ...base, batteryType: 'INDUSTRIAL', energyKwh: '1.5' });
  });
  it('offers a manual category for a voluntary passport and blocks Continue until one is chosen', () => {
    const p: Project = { ...base, batteryType: 'INDUSTRIAL', energyKwh: '1.5' };
    view(p);
    expect(screen.getByTestId('obligation-verdict').getAttribute('data-verdict')).toBe(
      'not_required',
    );
    expect(screen.getByTestId('manual-category')).toBeTruthy();
    expect((screen.getByTestId('project-continue') as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows the GS1 error text and blocks Continue on a wrong check digit', () => {
    view({
      ...base,
      identifier: {
        mode: 'gs1',
        resolverBase: 'https://id.example.com',
        gtin: '96385075',
        serial: 'S1',
      },
    });
    expect(screen.getByTestId('identifier-error').textContent).toContain('check digit');
    expect((screen.getByTestId('project-continue') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('qr-none')).toBeTruthy();
  });
  it('renders the QR preview for a valid GS1 identifier', () => {
    view({
      ...base,
      identifier: {
        mode: 'gs1',
        resolverBase: 'https://id.example.com',
        gtin: '96385074',
        serial: 'S1',
      },
    });
    expect(screen.getByTestId('qr-image')).toBeTruthy();
    expect(screen.getByTestId('qr-payload').textContent).toBe(
      'https://id.example.com/01/00000096385074/21/S1',
    );
  });
  it('switching the identifier mode dispatches an empty identifier of that mode', () => {
    const { onChange } = view(base);
    fireEvent.click(screen.getByTestId('identifier-mode-https'));
    expect(onChange).toHaveBeenCalledWith({ ...base, identifier: { mode: 'https', uri: '' } });
  });
  it('clicking the already-active identifier mode does not dispatch (would wipe the typed value)', () => {
    const p: Project = {
      ...base,
      identifier: {
        mode: 'gs1',
        resolverBase: 'https://id.example.com',
        gtin: '96385074',
        serial: 'S1',
      },
    };
    const { onChange } = view(p);
    fireEvent.click(screen.getByTestId('identifier-mode-gs1'));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('switching into draft mode reuses the placeholder URN instead of blanking it', () => {
    const p: Project = { ...base, identifier: { mode: 'https', uri: 'https://example.com/x' } };
    const { onChange } = view(p);
    fireEvent.click(screen.getByTestId('identifier-mode-draft'));
    expect(onChange).toHaveBeenCalledWith({ ...p, identifier: { mode: 'draft', urn: DRAFT_URN } });
  });
  it('renders German chrome', () => {
    mount(
      <ProjectView
        lang="de"
        project={base}
        derived={deriveProject(base, AT)}
        isNew
        draftUrn={DRAFT_URN}
        onChange={() => undefined}
        onContinue={() => undefined}
        onImport={() => ({ ok: true })}
        onResume={() => undefined}
        onReset={() => undefined}
      />,
    );
    expect(screen.getByText('Batterietyp')).toBeTruthy();
  });
  it('shows the resume card and wires its buttons', () => {
    const onResume = vi.fn();
    const onReset = vi.fn();
    mount(
      <ProjectView
        lang="en"
        project={base}
        derived={deriveProject(base, AT)}
        isNew={false}
        draftUrn={DRAFT_URN}
        resume={{ files: ['a.pdf'], updatedAt: '2026-09-05T12:00:00Z' }}
        onChange={() => undefined}
        onContinue={() => undefined}
        onImport={() => ({ ok: true })}
        onResume={onResume}
        onReset={onReset}
      />,
    );
    expect(screen.getByTestId('resume-card')).toBeTruthy();
    fireEvent.click(screen.getByText('Resume'));
    expect(onResume).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Start over'));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('reports a throwing import instead of letting the rejection escape', async () => {
    view(base, {
      onImport: () => {
        throw new Error('boom');
      },
    });
    fireEvent.change(screen.getByTestId('import-draft'), {
      target: { files: [new File(['{}'], 'draft.json', { type: 'application/json' })] },
    });
    expect((await screen.findByTestId('import-error')).textContent).toContain('boom');
  });

  it('shows the import error the importer returns', async () => {
    view(base, { onImport: () => ({ ok: false, message: { de: 'kaputt', en: 'broken' } }) });
    fireEvent.change(screen.getByTestId('import-draft'), {
      target: { files: [new File(['{}'], 'draft.json', { type: 'application/json' })] },
    });
    expect((await screen.findByTestId('import-error')).textContent).toContain('broken');
  });

  it('clears the file input so the same file can be picked again', async () => {
    const onImport = vi.fn(() => ({ ok: true }) as const);
    view(base, { onImport });
    const input = screen.getByTestId('import-draft') as HTMLInputElement;
    // jsdom keeps the FileList `fireEvent` installed even when `value` is reset, so the reset
    // itself is what the test can observe.
    let cleared = false;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => '',
      set: (v: string) => {
        cleared = v === '';
      },
    });
    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'draft.json', { type: 'application/json' })] },
    });
    expect(cleared).toBe(true);
    await waitFor(() => expect(onImport).toHaveBeenCalledWith('{}'));
  });
});
