import type { BatteryCategory, MappingConflict, MappingProposal, Verdict } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type LangText, type Language, pick, t } from '../i18n/index.ts';
import type { InvalidDecision } from '../workflow/derive/index.ts';
import type { Decision, DecisionKey } from '../workflow/state.ts';
import { validateValue } from '../workflow/validateValue.ts';
import { AddValueDialog } from './AddValueDialog.tsx';
import { ConfidenceBadge } from './parts/ConfidenceBadge.tsx';
import { SourceRef } from './parts/SourceRef.tsx';
import { VerdictChip } from './parts/VerdictChip.tsx';
import { RowEditorDialog } from './RowEditor.tsx';
import {
  type ArrayEntry,
  filterGroups,
  keyOf,
  type ReviewFilter,
  type ReviewGroup,
} from './reviewModel.ts';

export interface ReviewViewProps {
  lang: Language;
  category: BatteryCategory;
  groups: ReviewGroup[];
  manual: Decision[];
  arrays: ArrayEntry[];
  conflicts: MappingConflict[];
  invalidDecisions?: InvalidDecision[];
  accepted: number;
  pending: number;
  verdict: Verdict;
  onDecide(d: Decision): void;
  onClear(key: DecisionKey): void;
  onContinue(): void;
  arrayRows(attributeId: string): unknown;
}

function ProposalRow({
  lang,
  group,
  p,
  onDecide,
}: {
  lang: Language;
  group: ReviewGroup;
  p: MappingProposal;
  onDecide(d: Decision): void;
}) {
  const d = group.decision;
  const chosen = d && d.kind !== 'manual' && d.factId === p.factId ? d.kind : undefined;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(p.value ?? ''));
  const [unit, setUnit] = useState(p.unit ?? '');
  const [recordedAt, setRecordedAt] = useState('');
  const [error, setError] = useState<LangText | null>(null);
  // A dynamic value is only meaningful with the moment it was measured (PW-PLAUS-011). The
  // reviewer supplies it; the app never invents one from the clock.
  const dynamic = getAttribute(group.attributeId)?.dynamic === true;
  const base = {
    attributeId: group.attributeId,
    ...(group.path !== undefined ? { path: group.path } : {}),
    factId: p.factId,
  };
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-t py-2"
      data-testid="proposal"
      data-fact={p.factId}
      data-state={chosen ?? 'pending'}
    >
      {editing ? (
        <>
          <Input
            className="w-40"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="edit-value"
          />
          <Input
            className="w-20"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            data-testid="edit-unit"
          />
          {dynamic && (
            <>
              <Label htmlFor={`recorded-${p.factId}`}>{t(lang, 'review.recordedAt')}</Label>
              <Input
                className="w-56"
                id={`recorded-${p.factId}`}
                type="datetime-local"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                data-testid="edit-recorded-at"
              />
            </>
          )}
          <Button
            size="sm"
            onClick={() => {
              const stamp = recordedAt.trim() === '' ? undefined : recordedAt;
              const check = validateValue(group.attributeId, group.path, value, stamp);
              if (!check.ok) {
                setError(check.message);
                return;
              }
              setError(null);
              onDecide({
                kind: 'edit',
                ...base,
                value,
                ...(unit ? { unit } : {}),
                ...(stamp === undefined ? {} : { recordedAt: new Date(stamp).toISOString() }),
              });
              setEditing(false);
            }}
          >
            {t(lang, 'review.save')}
          </Button>
          {error && (
            <p className="text-destructive text-sm" data-testid="value-error">
              {pick(lang, error)}
            </p>
          )}
        </>
      ) : (
        <>
          <span className="font-mono" data-testid="proposal-value">
            {chosen === 'edit' && d?.kind === 'edit' ? d.value : String(p.value)}
          </span>
          <span className="text-muted-foreground">
            {chosen === 'edit' && d?.kind === 'edit' ? (d.unit ?? '') : (p.unit ?? '')}
          </span>
          {chosen === 'edit' && <span className="text-xs">{t(lang, 'review.edited')}</span>}
        </>
      )}
      <ConfidenceBadge value={p.confidence} />
      <SourceRef lang={lang} source={p.source} />
      <span className="text-muted-foreground text-xs">{pick(lang, p.why)}</span>
      <span className="ml-auto flex gap-1">
        <Button
          size="sm"
          variant={chosen === 'accept' ? 'default' : 'outline'}
          data-testid="accept"
          onClick={() => onDecide({ kind: 'accept', ...base })}
        >
          {t(lang, 'review.accept')}
        </Button>
        <Button
          size="sm"
          variant={chosen === 'reject' ? 'destructive' : 'outline'}
          data-testid="reject"
          onClick={() => onDecide({ kind: 'reject', ...base })}
        >
          {t(lang, 'review.reject')}
        </Button>
        <Button size="sm" variant="ghost" data-testid="edit" onClick={() => setEditing((v) => !v)}>
          {t(lang, 'review.edit')}
        </Button>
      </span>
    </div>
  );
}

export function ReviewView(props: ReviewViewProps) {
  const { lang } = props;
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const visible = filterGroups(props.groups, filter, search, lang);
  return (
    <div className="grid gap-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background py-2">
        <h2 className="font-semibold text-lg">{t(lang, 'review.title')}</h2>
        <span data-testid="review-summary">
          {t(lang, 'review.summary', { accepted: props.accepted, pending: props.pending })}
        </span>
        <VerdictChip lang={lang} verdict={props.verdict} />
        <Tabs value={filter} onValueChange={(v) => setFilter(v as ReviewFilter)}>
          <TabsList>
            {(['pending', 'accepted', 'rejected', 'all'] as const).map((f) => (
              <TabsTrigger key={f} value={f} data-testid={`filter-${f}`}>
                {t(lang, `review.filter.${f}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          className="w-48"
          placeholder={t(lang, 'review.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <AddValueDialog lang={lang} category={props.category} onAdd={props.onDecide} />
        <Button className="ml-auto" data-testid="to-gaps" onClick={props.onContinue}>
          {t(lang, 'review.continue')}
        </Button>
      </div>
      {props.conflicts.map((c) => (
        <p
          key={`${c.attributeId}${c.path ?? ''}`}
          className="text-destructive text-sm"
          data-testid="conflict"
        >
          {c.attributeId}
          {c.path ? `.${c.path}` : ''}:{' '}
          {t(lang, 'review.conflict', {
            existing: JSON.stringify(c.existing),
            incoming: JSON.stringify(c.incoming),
          })}
        </p>
      ))}
      {(props.invalidDecisions ?? []).map((d) => (
        <p key={d.key} className="text-destructive text-sm" data-testid="invalid-decision">
          {d.key}: {t(lang, 'review.invalidDecision', { reason: d.message })}{' '}
          <Button size="sm" variant="ghost" onClick={() => props.onClear(d.key)}>
            {t(lang, 'review.clear')}
          </Button>
        </p>
      ))}
      {props.manual.map((d) => (
        <Card key={keyOf(d)} data-testid="manual">
          <CardContent className="flex items-center gap-3 py-3">
            <span className="font-medium">
              {d.attributeId}
              {d.path ? `.${d.path}` : ''}
            </span>
            <span className="font-mono">
              {d.kind === 'manual'
                ? Array.isArray(d.value)
                  ? t(lang, 'rows.count', { count: d.value.length })
                  : d.value
                : ''}
            </span>
            <span className="text-xs">{t(lang, 'review.manual')}</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => props.onClear(keyOf(d))}
            >
              {t(lang, 'review.clear')}
            </Button>
          </CardContent>
        </Card>
      ))}
      {props.arrays.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-medium text-sm">{t(lang, 'review.arrays')}</h3>
          {props.arrays.map((a) => (
            <Card key={a.attributeId} data-testid="array-entry" data-attribute={a.attributeId}>
              <CardContent className="flex items-center gap-3 py-3">
                <span className="font-medium">{pick(lang, a.name)}</span>
                <span className="font-mono">{t(lang, 'rows.count', { count: a.rows })}</span>
                {a.origin === 'manual' && (
                  <span className="text-xs">{t(lang, 'review.manual')}</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  data-testid="array-edit"
                  onClick={() => setEditing(a.attributeId)}
                >
                  {t(lang, 'rows.edit')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {visible.length === 0 && <p className="text-muted-foreground">{t(lang, 'review.empty')}</p>}
      {visible.map((g) => (
        <Card key={g.key} data-testid="group" data-key={g.key}>
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              {pick(lang, g.name)}
              {g.path ? ` · ${g.path}` : ''}
              <span className="ml-2 font-normal text-muted-foreground text-xs">
                {g.legalRefs.join('; ')}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {g.proposals.map((p) => (
              <ProposalRow key={p.factId} lang={lang} group={g} p={p} onDecide={props.onDecide} />
            ))}
            {g.decision && (
              <Button size="sm" variant="link" onClick={() => props.onClear(g.key)}>
                {t(lang, 'review.clear')}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
      <RowEditorDialog
        lang={lang}
        attributeId={editing ?? ''}
        initial={editing ? props.arrayRows(editing) : undefined}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSave={(rows) => {
          if (editing) props.onDecide({ kind: 'manual', attributeId: editing, value: rows });
        }}
      />
    </div>
  );
}
