import type { BatteryType, Role } from '@passwerk/core';
import { BATTERY_TYPES, ROLES } from '@passwerk/core';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type Key, type LangText, type Language, pick, t } from '../i18n/index.ts';
import type { ProjectDerived } from '../workflow/derive/project.ts';
import {
  IDENTIFIER_MODES,
  type Identifier,
  type IdentifierMode,
  type Project,
} from '../workflow/project.ts';
import { ObligationsPanel } from './parts/ObligationsPanel.tsx';
import { QrPreview } from './parts/QrPreview.tsx';
import { DateField } from './shell/DateField.tsx';
import { Field } from './shell/Field.tsx';
import { GroupHeader } from './shell/GroupHeader.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { InlineStatus } from './shell/InlineStatus.tsx';
import { Instrument } from './shell/Instrument.tsx';

export interface ProjectViewProps {
  lang: Language;
  project: Project;
  derived: ProjectDerived;
  /** True until the project has been saved once: the primary button reads "Create project". */
  isNew: boolean;
  /** The placeholder draft URN generated at mount; reused when switching back into draft mode. */
  draftUrn: string;
  resume?: { files: string[]; updatedAt: string };
  /** A footer-slot status line, forwarded to `Instrument` (storage, host or a caught failure). */
  notice?: ReactNode;
  onChange(project: Project): void;
  onContinue(): void;
  onImport(text: string): { ok: true } | { ok: false; message: LangText };
  onResume(): void;
  onReset(): void;
}

/**
 * "1,5" -> "1.5"; whitespace trimmed; an empty field means "not given". Only the first comma is
 * replaced: a second one is not a thousands or decimal separator here, so it is left as typed and
 * core reports the whole string as an unparsable energy value (insufficient input) rather than
 * this function silently discarding part of what the reviewer entered.
 */
export function normaliseEnergy(raw: string): string | undefined {
  const s = raw.trim().replace(',', '.');
  return s === '' ? undefined : s;
}

/**
 * An empty identifier for `mode`: the resolver base survives a switch between the two GS1 modes,
 * and switching into draft reuses the project's existing draft URN (or, when there was none yet,
 * the placeholder generated at mount) rather than blanking it.
 */
function emptyIdentifier(mode: IdentifierMode, previous: Identifier, draftUrn: string): Identifier {
  const resolverBase = 'resolverBase' in previous ? previous.resolverBase : '';
  switch (mode) {
    case 'gs1':
      return { mode, resolverBase, gtin: '', serial: '' };
    case 'gs1-giai':
      return { mode, resolverBase, giai: '' };
    case 'https':
      return { mode, uri: '' };
    case 'draft':
      return { mode, urn: previous.mode === 'draft' ? previous.urn : draftUrn };
  }
}

/** One labelled identifier input; every mode's fields (including the shared resolver base) use it. */
function IdField({
  id,
  label,
  value,
  onValue,
}: {
  id: string;
  label: string;
  value: string;
  onValue: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Input id={id} data-testid={id} value={value} onChange={(e) => onValue(e.target.value)} />
    </Field>
  );
}

export function ProjectView(props: ProjectViewProps & { top: ReactNode; children?: ReactNode }) {
  const {
    lang,
    project,
    derived,
    isNew,
    draftUrn,
    resume,
    onChange,
    onContinue,
    onImport,
    onResume,
    onReset,
    top,
    children,
  } = props;
  const [importError, setImportError] = useState<string | null>(null);
  const identifier = project.identifier;

  const onEnergyChange = (raw: string) => {
    const value = normaliseEnergy(raw);
    const { energyKwh: _dropped, ...rest } = project;
    onChange(value === undefined ? rest : { ...rest, energyKwh: value });
  };

  const onDateChange = (raw: string) => {
    const { placedOnMarketDate: _dropped, ...rest } = project;
    onChange(raw === '' ? rest : { ...rest, placedOnMarketDate: raw });
  };

  const onIdentifierModeChange = (mode: IdentifierMode) => {
    onChange({ ...project, identifier: emptyIdentifier(mode, identifier, draftUrn) });
  };

  // `void onFile(...)` in the change handler has nowhere to report a rejection, so every failure
  // (reading the file, or an `onImport` that throws rather than returning a message) becomes the
  // same inline error.
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = onImport(await file.text());
      setImportError(r.ok ? null : t(lang, 'start.import.error', { reason: r.message[lang] }));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setImportError(t(lang, 'start.import.error', { reason }));
    }
  };

  const identifierInvalid = !derived.identifier.ok;
  const [openSection, setOpenSection] = useState<'identifier' | 'import' | null>(null);
  const identifierOpen = openSection === 'identifier' || identifierInvalid;
  const importOpen = openSection === 'import';
  const toggleSection = (s: 'identifier' | 'import') => setOpenSection((o) => (o === s ? null : s));

  return (
    <Instrument
      top={top}
      notice={props.notice}
      hero={
        resume ? (
          <div className="flex w-full items-end justify-between gap-4" data-testid="resume-card">
            <HeroNumber
              label={t(lang, 'start.resume.title')}
              value={String(resume.files.length)}
              unit={t(lang, 'hero.documents').toLowerCase()}
            />
            <span className="flex items-center gap-2 pb-1">
              <span className="label">
                {t(lang, 'start.resume.saved', {
                  at: new Date(resume.updatedAt).toLocaleString(lang),
                })}
              </span>
              <Button variant="primary" size="sm" onClick={onResume}>
                {t(lang, 'start.resume.button')}
              </Button>
              <Button variant="ghost" size="sm" onClick={onReset}>
                {t(lang, 'app.startOver')}
              </Button>
            </span>
          </div>
        ) : (
          // The obligation verdict is this screen's one hero (spec 6.1). The battery type is a
          // value, so it reads as a value: mono 14 px, not a second Doto display that competes
          // with the verdict for the eye - and "Elektrofahrzeugbatterie" is 23 characters of
          // dot matrix, which is not what Doto is for either.
          <div data-testid="project-hero">
            <div className="label">{t(lang, 'project.title')}</div>
            <div className="font-mono text-[14px] text-display">
              {t(lang, `project.batteryType.${project.batteryType}` as Key)}
            </div>
          </div>
        )
      }
      footer={
        <>
          <span className="flex-1" />
          <Button
            variant="primary"
            data-testid="project-continue"
            disabled={derived.meta === null}
            onClick={onContinue}
          >
            {t(lang, isNew ? 'project.create' : 'project.continue')} →
          </Button>
        </>
      }
    >
      <div className="grid gap-6 py-2 sm:grid-cols-[330px_1fr]">
        <div className="grid content-start gap-4 sm:border-r sm:border-border sm:pr-6">
          <Field label={t(lang, 'project.batteryType')} htmlFor="battery-type">
            <Select
              value={project.batteryType}
              onValueChange={(v) => onChange({ ...project, batteryType: v as BatteryType })}
            >
              <SelectTrigger id="battery-type" data-testid="battery-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BATTERY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(lang, `project.batteryType.${type}` as Key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t(lang, 'project.role')} htmlFor="role">
            <Select
              value={project.role}
              onValueChange={(v) => onChange({ ...project, role: v as Role })}
            >
              <SelectTrigger id="role" data-testid="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(lang, `project.role.${role}` as Key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t(lang, 'project.energyKwh')}
              htmlFor="energy-kwh"
              hint={t(lang, 'project.energyKwh.hint')}
            >
              <Input
                id="energy-kwh"
                data-testid="energy-kwh"
                inputMode="decimal"
                value={project.energyKwh ?? ''}
                onChange={(e) => onEnergyChange(e.target.value)}
              />
            </Field>
            <DateField
              lang={lang}
              id="placed-on-market"
              data-testid="placed-on-market"
              label={t(lang, 'project.placedOnMarketDate')}
              value={project.placedOnMarketDate ?? ''}
              onChange={onDateChange}
            />
          </div>
          <div>
            <GroupHeader
              name={`${t(lang, 'project.identifier.section')} · ${t(lang, `project.identifier.mode.${identifier.mode}` as Key)}`}
              count=""
              open={identifierOpen}
              onToggle={() => toggleSection('identifier')}
              data-testid="section-identifier"
            />
            <div hidden={!identifierOpen} className="grid gap-3 py-3">
              <ToggleGroup
                type="single"
                className="w-full flex-wrap"
                value={identifier.mode}
                aria-label={t(lang, 'project.identifier.title')}
                onValueChange={(mode) => {
                  if (mode && mode !== identifier.mode)
                    onIdentifierModeChange(mode as IdentifierMode);
                }}
              >
                {IDENTIFIER_MODES.map((mode) => (
                  <ToggleGroupItem key={mode} value={mode} data-testid={`identifier-mode-${mode}`}>
                    {t(lang, `project.identifier.mode.${mode}` as Key)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {identifier.mode === 'gs1' && (
                <>
                  <IdField
                    id="identifier-resolver"
                    label={t(lang, 'project.identifier.resolverBase')}
                    value={identifier.resolverBase}
                    onValue={(v) =>
                      onChange({ ...project, identifier: { ...identifier, resolverBase: v } })
                    }
                  />
                  <IdField
                    id="identifier-gtin"
                    label={t(lang, 'project.identifier.gtin')}
                    value={identifier.gtin}
                    onValue={(v) =>
                      onChange({ ...project, identifier: { ...identifier, gtin: v } })
                    }
                  />
                  <IdField
                    id="identifier-serial"
                    label={t(lang, 'project.identifier.serial')}
                    value={identifier.serial}
                    onValue={(v) =>
                      onChange({ ...project, identifier: { ...identifier, serial: v } })
                    }
                  />
                </>
              )}
              {identifier.mode === 'gs1-giai' && (
                <>
                  <IdField
                    id="identifier-resolver"
                    label={t(lang, 'project.identifier.resolverBase')}
                    value={identifier.resolverBase}
                    onValue={(v) =>
                      onChange({ ...project, identifier: { ...identifier, resolverBase: v } })
                    }
                  />
                  <IdField
                    id="identifier-giai"
                    label={t(lang, 'project.identifier.giai')}
                    value={identifier.giai}
                    onValue={(v) =>
                      onChange({ ...project, identifier: { ...identifier, giai: v } })
                    }
                  />
                </>
              )}
              {identifier.mode === 'https' && (
                <IdField
                  id="identifier-uri"
                  label={t(lang, 'project.identifier.uri')}
                  value={identifier.uri}
                  onValue={(v) => onChange({ ...project, identifier: { ...identifier, uri: v } })}
                />
              )}
              {identifier.mode === 'draft' && (
                <>
                  <IdField
                    id="identifier-urn"
                    label={t(lang, 'project.identifier.urn')}
                    value={identifier.urn}
                    onValue={(v) => onChange({ ...project, identifier: { ...identifier, urn: v } })}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    {t(lang, 'project.identifier.draft.hint')}
                  </p>
                </>
              )}
              {!derived.identifier.ok && (
                <InlineStatus
                  kind="error"
                  text={pick(lang, derived.identifier.message)}
                  data-testid="identifier-error"
                />
              )}
              <QrPreview lang={lang} carrier={derived.carrier} />
            </div>
            <GroupHeader
              name={t(lang, 'project.import.section')}
              count=""
              open={importOpen}
              onToggle={() => toggleSection('import')}
              data-testid="section-import"
            />
            <div hidden={!importOpen} className="grid gap-2 py-3">
              <Input
                data-testid="import-draft"
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Clearing the input makes re-picking the same path fire `change` again, so a
                  // corrected file of the same name can be imported without a detour.
                  e.target.value = '';
                  void onFile(file);
                }}
              />
              {importError && (
                <InlineStatus kind="error" text={importError} data-testid="import-error" />
              )}
            </div>
          </div>
        </div>
        <ObligationsPanel
          lang={lang}
          result={derived.obligations}
          {...(project.manualCategory !== undefined
            ? { manualCategory: project.manualCategory }
            : {})}
          onManualCategory={(c) => {
            const { manualCategory: _dropped, ...rest } = project;
            onChange(c ? { ...rest, manualCategory: c } : rest);
          }}
        />
      </div>
      {children}
    </Instrument>
  );
}
