import type { BatteryType, Role } from '@passwerk/core';
import { BATTERY_TYPES, ROLES } from '@passwerk/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Key, type LangText, type Language, pick, t } from '../i18n/index.ts';
import type { ProjectDerived } from '../workflow/derive/project.ts';
import {
  IDENTIFIER_MODES,
  type Identifier,
  type IdentifierMode,
  type Project,
} from '../workflow/project.ts';
import { ObligationsCard } from './parts/ObligationsCard.tsx';
import { QrPreview } from './parts/QrPreview.tsx';

export interface ProjectViewProps {
  lang: Language;
  project: Project;
  derived: ProjectDerived;
  /** True until the project has been saved once: the primary button reads "Create project". */
  isNew: boolean;
  resume?: { files: string[]; updatedAt: string };
  onChange(project: Project): void;
  onContinue(): void;
  onImport(text: string): { ok: true } | { ok: false; message: LangText };
  onResume(): void;
  onReset(): void;
}

/** "1,5" -> "1.5"; whitespace trimmed; an empty field means "not given". */
export function normaliseEnergy(raw: string): string | undefined {
  const s = raw.trim().replace(',', '.');
  return s === '' ? undefined : s;
}

function emptyIdentifier(mode: IdentifierMode, previous: Identifier): Identifier {
  const resolverBase = 'resolverBase' in previous ? previous.resolverBase : '';
  switch (mode) {
    case 'gs1':
      return { mode, resolverBase, gtin: '', serial: '' };
    case 'gs1-giai':
      return { mode, resolverBase, giai: '' };
    case 'https':
      return { mode, uri: '' };
    case 'draft':
      return { mode, urn: '' };
  }
}

export function ProjectView(props: ProjectViewProps) {
  const {
    lang,
    project,
    derived,
    isNew,
    resume,
    onChange,
    onContinue,
    onImport,
    onResume,
    onReset,
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
    onChange({ ...project, identifier: emptyIdentifier(mode, project.identifier) });
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

  return (
    <div className="grid gap-4">
      {resume && (
        <Card data-testid="resume-card">
          <CardHeader>
            <CardTitle>{t(lang, 'start.resume.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground">
              {t(lang, 'start.resume.files', { count: resume.files.length })}
            </span>
            <span className="text-muted-foreground">
              {t(lang, 'start.resume.saved', {
                at: new Date(resume.updatedAt).toLocaleString(lang),
              })}
            </span>
            <Button onClick={onResume}>{t(lang, 'start.resume.button')}</Button>
            <Button variant="outline" onClick={onReset}>
              {t(lang, 'app.startOver')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t(lang, 'project.battery.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="battery-type">{t(lang, 'project.batteryType')}</Label>
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
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">{t(lang, 'project.role')}</Label>
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
          </div>
          <div className="grid gap-2">
            <Label htmlFor="energy-kwh">{t(lang, 'project.energyKwh')}</Label>
            <Input
              id="energy-kwh"
              data-testid="energy-kwh"
              inputMode="decimal"
              value={project.energyKwh ?? ''}
              onChange={(e) => onEnergyChange(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t(lang, 'project.energyKwh.hint')}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="placed-on-market">{t(lang, 'project.placedOnMarketDate')}</Label>
            <Input
              id="placed-on-market"
              data-testid="placed-on-market"
              type="date"
              value={project.placedOnMarketDate ?? ''}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <ObligationsCard
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

      <Card>
        <CardHeader>
          <CardTitle>{t(lang, 'project.identifier.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-3">
            <Tabs
              value={identifier.mode}
              onValueChange={(m) => onIdentifierModeChange(m as IdentifierMode)}
            >
              <TabsList>
                {IDENTIFIER_MODES.map((mode) => (
                  <TabsTrigger
                    key={mode}
                    value={mode}
                    data-testid={`identifier-mode-${mode}`}
                    // Radix's TabsTrigger switches on mousedown/keydown/focus, not click; a
                    // plain onClick keeps a synthetic click (as fired by tests, and by browsers
                    // that do not focus a button on click) working the same way.
                    onClick={() => onIdentifierModeChange(mode)}
                  >
                    {t(lang, `project.identifier.mode.${mode}` as Key)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {identifier.mode === 'gs1' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="identifier-resolver">
                    {t(lang, 'project.identifier.resolverBase')}
                  </Label>
                  <Input
                    id="identifier-resolver"
                    data-testid="identifier-resolver"
                    value={identifier.resolverBase}
                    onChange={(e) =>
                      onChange({
                        ...project,
                        identifier: { ...identifier, resolverBase: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="identifier-gtin">{t(lang, 'project.identifier.gtin')}</Label>
                  <Input
                    id="identifier-gtin"
                    data-testid="identifier-gtin"
                    value={identifier.gtin}
                    onChange={(e) =>
                      onChange({ ...project, identifier: { ...identifier, gtin: e.target.value } })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="identifier-serial">{t(lang, 'project.identifier.serial')}</Label>
                  <Input
                    id="identifier-serial"
                    data-testid="identifier-serial"
                    value={identifier.serial}
                    onChange={(e) =>
                      onChange({
                        ...project,
                        identifier: { ...identifier, serial: e.target.value },
                      })
                    }
                  />
                </div>
              </>
            )}
            {identifier.mode === 'gs1-giai' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="identifier-resolver">
                    {t(lang, 'project.identifier.resolverBase')}
                  </Label>
                  <Input
                    id="identifier-resolver"
                    data-testid="identifier-resolver"
                    value={identifier.resolverBase}
                    onChange={(e) =>
                      onChange({
                        ...project,
                        identifier: { ...identifier, resolverBase: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="identifier-giai">{t(lang, 'project.identifier.giai')}</Label>
                  <Input
                    id="identifier-giai"
                    data-testid="identifier-giai"
                    value={identifier.giai}
                    onChange={(e) =>
                      onChange({ ...project, identifier: { ...identifier, giai: e.target.value } })
                    }
                  />
                </div>
              </>
            )}
            {identifier.mode === 'https' && (
              <div className="grid gap-2">
                <Label htmlFor="identifier-uri">{t(lang, 'project.identifier.uri')}</Label>
                <Input
                  id="identifier-uri"
                  data-testid="identifier-uri"
                  value={identifier.uri}
                  onChange={(e) =>
                    onChange({ ...project, identifier: { ...identifier, uri: e.target.value } })
                  }
                />
              </div>
            )}
            {identifier.mode === 'draft' && (
              <div className="grid gap-2">
                <Label htmlFor="identifier-urn">{t(lang, 'project.identifier.urn')}</Label>
                <Input
                  id="identifier-urn"
                  data-testid="identifier-urn"
                  value={identifier.urn}
                  onChange={(e) =>
                    onChange({ ...project, identifier: { ...identifier, urn: e.target.value } })
                  }
                />
                <p className="text-muted-foreground text-xs">
                  {t(lang, 'project.identifier.draft.hint')}
                </p>
              </div>
            )}
            {!derived.identifier.ok && (
              <p className="text-destructive text-sm" data-testid="identifier-error">
                {pick(lang, derived.identifier.message)}
              </p>
            )}
          </div>
          <QrPreview lang={lang} carrier={derived.carrier} />
        </CardContent>
      </Card>

      <Button data-testid="project-continue" disabled={derived.meta === null} onClick={onContinue}>
        {t(lang, isNew ? 'project.create' : 'project.continue')}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{t(lang, 'start.import')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
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
            <p className="text-destructive text-sm" data-testid="import-error">
              {importError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
