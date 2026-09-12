import type { BatteryCategory, ObligationResult } from '@passwerk/core';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Key, type Language, pick, t } from '../../i18n/index.ts';
import { Field } from '../shell/Field.tsx';
import { GroupHeader } from '../shell/GroupHeader.tsx';
import { HeroNumber } from '../shell/HeroNumber.tsx';
import { Row } from '../shell/Row.tsx';

const CATEGORIES: BatteryCategory[] = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'];
const NONE = '__none__';

/** The obligation result as the project screen's hero (spec §6.1): the answer first, the reasons behind rows. */
export function ObligationsPanel({
  lang,
  result,
  manualCategory,
  onManualCategory,
}: {
  lang: Language;
  result: ObligationResult;
  manualCategory?: BatteryCategory;
  onManualCategory(category: BatteryCategory | undefined): void;
}) {
  const [open, setOpen] = useState<'timeline' | 'role' | 'sources' | null>(null);
  const toggle = (k: 'timeline' | 'role' | 'sources') => setOpen((o) => (o === k ? null : k));
  const missing = result.missingInput.map((m) => t(lang, `project.missing.${m}` as Key)).join(', ');
  return (
    <div className="grid content-start gap-3" data-testid="obligations-card">
      <HeroNumber
        label={t(lang, 'hero.obligation')}
        value={t(lang, `project.obligations.${result.verdict}`)}
        tone={result.verdict === 'insufficient_input' ? 'accent' : 'display'}
        data-testid="obligation-verdict"
        data-verdict={result.verdict}
      />
      <p className="text-[13px] text-muted-foreground" data-testid="obligation-reason">
        {pick(lang, result.reason)}
      </p>
      {missing && (
        <p className="text-[13px] text-destructive">
          {t(lang, 'project.obligations.missing', { fields: missing })}
        </p>
      )}
      {result.category ? (
        <p className="text-[13px]" data-testid="obligation-category">
          {t(lang, 'project.category.derived', {
            category: t(lang, `category.${result.category}`),
          })}
        </p>
      ) : (
        <Field
          label={t(lang, 'project.category')}
          htmlFor="manual-category"
          hint={t(lang, 'project.category.voluntary')}
        >
          <Select
            value={manualCategory ?? NONE}
            onValueChange={(v) => onManualCategory(v === NONE ? undefined : (v as BatteryCategory))}
          >
            <SelectTrigger id="manual-category" data-testid="manual-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t(lang, 'project.category.none')}</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(lang, `category.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <div>
        <GroupHeader
          name={t(lang, 'project.timeline')}
          count={String(result.timeline.length)}
          open={open === 'timeline'}
          onToggle={() => toggle('timeline')}
          data-testid="section-timeline"
        />
        <ul hidden={open !== 'timeline'}>
          {result.timeline.map((e) => (
            <li key={e.id} data-testid="timeline-entry" data-id={e.id}>
              <Row
                name={pick(lang, e.title)}
                value={e.date}
                tags={[
                  {
                    label: t(
                      lang,
                      e.inEffect ? 'project.timeline.inEffect' : 'project.timeline.upcoming',
                    ),
                    tone: e.inEffect ? 'success' : 'dim',
                  },
                  ...(e.verify
                    ? [{ label: t(lang, 'gaps.verify.short'), tone: 'warning' as const }]
                    : []),
                ]}
                indent
                data-legal={e.legalRef}
              />
            </li>
          ))}
        </ul>
        <GroupHeader
          name={t(lang, 'project.roleGuidance.section')}
          count=""
          open={open === 'role'}
          onToggle={() => toggle('role')}
          data-testid="section-role"
        />
        <p hidden={open !== 'role'} className="py-2 pl-5 text-[13px] text-muted-foreground">
          {pick(lang, result.roleGuidance)}
        </p>
        <GroupHeader
          name={t(lang, 'project.sources.section')}
          count={String(result.sources.length)}
          open={open === 'sources'}
          onToggle={() => toggle('sources')}
          data-testid="section-sources"
        />
        <p
          hidden={open !== 'sources'}
          className="py-2 pl-5 font-mono text-[12px] text-muted-foreground"
        >
          {result.sources.join('; ')}
        </p>
      </div>
      <p className="note" data-testid="not-legal-advice">
        {t(lang, 'app.notLegalAdvice')}
      </p>
    </div>
  );
}
