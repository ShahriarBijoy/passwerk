import type { BatteryCategory, MappingConflict, MappingProposal, Verdict } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type LangText, type Language, pick, rowsCount, t } from '../i18n/index.ts';
import type { AssistCritique } from '../workflow/assist/types.ts';
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
import { Field } from './shell/Field.tsx';
import { GroupHeader } from './shell/GroupHeader.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { InlineStatus } from './shell/InlineStatus.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row, type RowTag } from './shell/Row.tsx';
import { SegmentedBar } from './shell/SegmentedBar.tsx';
import { Sheet } from './shell/Sheet.tsx';

export interface ReviewViewProps {
  lang: Language;
  top: ReactNode;
  category: BatteryCategory;
  groups: ReviewGroup[];
  manual: Decision[];
  arrays: ArrayEntry[];
  conflicts: MappingConflict[];
  invalidDecisions?: InvalidDecision[];
  /**
   * Second opinions from the bring-your-own-key assist (ADR D-038). They mark a row and say
   * why; they never decide anything, never touch the draft and never move a verdict. The
   * reviewer resolves one with the accept, reject and edit controls that are already there.
   */
  critiques?: AssistCritique[];
  /** The assist panel, supplied by the shell. Absent when the host offers no assist. */
  assistPanel?: ReactNode;
  /** The shell owns whether the assist sheet is open, so the toolbar toggle and the sheet agree. */
  assistOpen?: boolean;
  onAssistToggle?(): void;
  accepted: number;
  pending: number;
  verdict: Verdict;
  onDecide(d: Decision): void;
  onClear(key: DecisionKey): void;
  onContinue(): void;
  arrayRows(attributeId: string): unknown;
  children?: ReactNode;
  /** Prefills the search box, e.g. when a caller remounts the view on a fresh key. */
  initialSearch?: string;
}

/** One candidate inside the sheet: value, provenance, why, and the three decisions. */
function Candidate({
  lang,
  group,
  p,
  critique,
  onDecide,
}: {
  lang: Language;
  group: ReviewGroup;
  p: MappingProposal;
  critique?: AssistCritique;
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
  const save = () => {
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
  };
  return (
    <div
      className="grid gap-2 border-t border-border py-3 first:border-t-0 first:pt-0"
      data-testid="proposal"
      data-fact={p.factId}
      data-state={chosen ?? 'pending'}
    >
      {editing ? (
        <div className="flex flex-wrap items-end gap-3">
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
            <Field label={t(lang, 'review.recordedAt')} htmlFor={`recorded-${p.factId}`}>
              <Input
                className="w-56"
                id={`recorded-${p.factId}`}
                type="datetime-local"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                data-testid="edit-recorded-at"
              />
            </Field>
          )}
          <Button variant="primary" size="sm" onClick={save}>
            {t(lang, 'review.save')}
          </Button>
          {error && (
            <InlineStatus kind="error" text={pick(lang, error)} data-testid="value-error" />
          )}
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[22px] text-display" data-testid="proposal-value">
            {chosen === 'edit' && d?.kind === 'edit' ? d.value : String(p.value)}
          </span>
          <span className="label">
            {chosen === 'edit' && d?.kind === 'edit' ? (d.unit ?? '') : (p.unit ?? '')}
          </span>
          {chosen === 'edit' && <span className="label">{t(lang, 'review.edited')}</span>}
          <ConfidenceBadge value={p.confidence} />
          <SourceRef lang={lang} source={p.source} />
        </div>
      )}
      <p className="text-[13px]">{pick(lang, p.why)}</p>
      {critique && (
        <p className="text-[12px] text-warning" data-testid="assist-critique-chip">
          {t(lang, 'assist.critique.chip')}: {critique.reason}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant={chosen === 'accept' ? 'primary' : 'secondary'}
          size="sm"
          data-testid="accept"
          onClick={() => onDecide({ kind: 'accept', ...base })}
        >
          {t(lang, 'review.accept')}
        </Button>
        <Button
          variant={chosen === 'reject' ? 'destructive' : 'secondary'}
          size="sm"
          data-testid="reject"
          onClick={() => onDecide({ kind: 'reject', ...base })}
        >
          {t(lang, 'review.reject')}
        </Button>
        <Button variant="ghost" size="sm" data-testid="edit" onClick={() => setEditing((v) => !v)}>
          {t(lang, 'review.edit')}
        </Button>
      </div>
    </div>
  );
}

const stateTag = (g: ReviewGroup, lang: Language): RowTag[] => {
  if (!g.decision) return [];
  if (g.decision.kind === 'reject')
    return [{ label: t(lang, 'review.filter.rejected'), tone: 'dim' }];
  if (g.decision.kind === 'edit') return [{ label: t(lang, 'review.edited'), tone: 'success' }];
  return [{ label: t(lang, 'review.filter.accepted'), tone: 'success' }];
};

export function ReviewView(props: ReviewViewProps) {
  const { lang } = props;
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [search, setSearch] = useState(props.initialSearch ?? '');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editingArray, setEditingArray] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const visible = filterGroups(props.groups, filter, search, lang);
  const openIndex = visible.findIndex((g) => g.key === openKey);
  const openGroup = openIndex >= 0 ? visible[openIndex] : undefined;
  const openArray = props.arrays.find((a) => `array:${a.attributeId}` === openKey);
  const openManual = props.manual.find((d) => `manual:${keyOf(d)}` === openKey);
  const total = props.accepted + props.pending;
  const critiqueOf = (g: ReviewGroup, p: MappingProposal) =>
    (props.critiques ?? []).find(
      (c) => c.factId === p.factId && c.attributeId === g.attributeId && c.path === g.path,
    );

  // Deciding the open group can drop it out of the current filter (accepting under PENDING,
  // say). Rather than let the sheet vanish mid-loop, it advances to the next visible group —
  // or the previous one if this was the last — before the decision reaches the caller.
  const decide = (d: Decision) => {
    if (openGroup) {
      const leaves =
        filter === 'pending'
          ? true
          : filter === 'accepted'
            ? d.kind === 'reject'
            : filter === 'rejected'
              ? d.kind !== 'reject'
              : false;
      if (leaves) {
        setOpenKey(visible[openIndex + 1]?.key ?? visible[openIndex - 1]?.key ?? null);
      }
    }
    props.onDecide(d);
  };

  const sheet = openGroup ? (
    <Sheet
      lang={lang}
      open
      title={`${pick(lang, openGroup.name)}${openGroup.path ? ` · ${openGroup.path}` : ''}`}
      meta={openGroup.legalRefs.join('; ')}
      position={{ index: openIndex + 1, total: visible.length }}
      {...(openIndex > 0 ? { onPrev: () => setOpenKey(visible[openIndex - 1]?.key ?? null) } : {})}
      {...(openIndex < visible.length - 1
        ? { onNext: () => setOpenKey(visible[openIndex + 1]?.key ?? null) }
        : {})}
      onClose={() => setOpenKey(null)}
      actions={
        openGroup.decision && (
          <Button variant="ghost" size="sm" onClick={() => props.onClear(openGroup.key)}>
            {t(lang, 'review.clear')}
          </Button>
        )
      }
      data-testid="review-sheet"
    >
      {openGroup.proposals.map((p) => {
        const critique = critiqueOf(openGroup, p);
        return (
          <Candidate
            key={p.factId}
            lang={lang}
            group={openGroup}
            p={p}
            {...(critique ? { critique } : {})}
            onDecide={decide}
          />
        );
      })}
    </Sheet>
  ) : openArray ? (
    <Sheet
      lang={lang}
      open
      title={pick(lang, openArray.name)}
      meta={rowsCount(lang, openArray.rows)}
      onClose={() => setOpenKey(null)}
      actions={
        <Button
          size="sm"
          data-testid="array-edit"
          onClick={() => setEditingArray(openArray.attributeId)}
        >
          {t(lang, 'rows.edit')}
        </Button>
      }
      data-testid="review-sheet"
    >
      <p>{openArray.origin === 'manual' ? t(lang, 'review.manual') : ''}</p>
    </Sheet>
  ) : openManual ? (
    <Sheet
      lang={lang}
      open
      title={`${openManual.attributeId}${openManual.path ? `.${openManual.path}` : ''}`}
      meta={t(lang, 'review.manual')}
      onClose={() => setOpenKey(null)}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            props.onClear(keyOf(openManual));
            setOpenKey(null);
          }}
        >
          {t(lang, 'review.clear')}
        </Button>
      }
      data-testid="review-sheet"
    >
      <span className="font-mono text-[22px] text-display">
        {openManual.kind === 'manual'
          ? Array.isArray(openManual.value)
            ? rowsCount(lang, openManual.value.length)
            : openManual.value
          : ''}
      </span>
    </Sheet>
  ) : props.assistOpen && props.assistPanel ? (
    <Sheet
      lang={lang}
      open
      title={t(lang, 'review.assist')}
      onClose={() => props.onAssistToggle?.()}
      data-testid="assist-sheet"
    >
      {props.assistPanel}
    </Sheet>
  ) : undefined;

  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber label={t(lang, 'hero.pending')} value={String(props.pending)} />
          <div className="flex-1 pb-1.5">
            <SegmentedBar filled={props.accepted} total={total} />
            <div className="label mt-1.5 flex gap-2">
              <span data-testid="review-summary">
                {t(lang, 'review.summary', { accepted: props.accepted, pending: props.pending })}
              </span>
              <span>·</span>
              <VerdictChip lang={lang} verdict={props.verdict} />
            </div>
          </div>
        </>
      }
      toolbar={
        <>
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as ReviewFilter)}
          >
            {(['pending', 'accepted', 'rejected', 'all'] as const).map((f) => (
              <ToggleGroupItem key={f} value={f} data-testid={`filter-${f}`}>
                {t(lang, `review.filter.${f}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="flex-1" />
          <Input
            className="w-32"
            placeholder={t(lang, 'review.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {props.assistPanel && props.onAssistToggle && (
            <Button
              variant="ghost"
              size="sm"
              data-testid="assist-toggle"
              aria-pressed={props.assistOpen ?? false}
              onClick={props.onAssistToggle}
            >
              {t(lang, 'review.assist')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            data-testid="add-value"
            onClick={() => setAddOpen(true)}
          >
            + {t(lang, 'review.addValue')}
          </Button>
        </>
      }
      footer={
        <>
          <span className="flex-1" />
          <Button variant="primary" data-testid="to-gaps" onClick={props.onContinue}>
            {t(lang, 'review.continue')} →
          </Button>
        </>
      }
      sheet={sheet}
    >
      {props.conflicts.map((c) => (
        <div key={`${c.attributeId}${c.path ?? ''}`} className="py-1">
          <InlineStatus
            kind="error"
            data-testid="conflict"
            text={`${c.attributeId}${c.path ? `.${c.path}` : ''}: ${t(lang, 'review.conflict', {
              existing: JSON.stringify(c.existing),
              incoming: JSON.stringify(c.incoming),
            })}`}
          />
        </div>
      ))}
      {(props.invalidDecisions ?? []).map((d) => (
        <div key={d.key} className="py-1">
          <InlineStatus
            kind="error"
            data-testid="invalid-decision"
            text={`${d.key}: ${t(lang, 'review.invalidDecision', {
              reason: typeof d.message === 'string' ? d.message : pick(lang, d.message),
            })}`}
            action={
              <Button variant="ghost" size="sm" onClick={() => props.onClear(d.key)}>
                {t(lang, 'review.clear')}
              </Button>
            }
          />
        </div>
      ))}
      {visible.length === 0 && props.manual.length === 0 && props.arrays.length === 0 && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {t(lang, 'review.empty')}
        </p>
      )}
      {visible.map((g) => {
        const best = g.proposals[0];
        const hasCritique = g.proposals.some((p) => critiqueOf(g, p));
        return (
          <Row
            key={g.key}
            name={`${pick(lang, g.name)}${g.path ? ` · ${g.path}` : ''}`}
            value={
              best
                ? g.decision?.kind === 'edit'
                  ? g.decision.value
                  : String(best.value)
                : undefined
            }
            {...(best
              ? { unit: g.decision?.kind === 'edit' ? (g.decision.unit ?? '') : (best.unit ?? '') }
              : {})}
            tags={[
              ...(best
                ? [{ label: `${Math.round(best.confidence * 100)} %`, tone: 'dim' as const }]
                : []),
              ...(g.proposals.length > 1
                ? [
                    {
                      label: t(lang, 'review.candidates', { count: g.proposals.length }),
                      tone: 'dim' as const,
                    },
                  ]
                : []),
              ...stateTag(g, lang),
            ]}
            dot={hasCritique ? 'bad' : 'none'}
            open={g.key === openKey}
            onOpen={() => setOpenKey(g.key)}
            data-testid="group"
            data-key={g.key}
            data-critique={hasCritique ? 'true' : undefined}
          />
        );
      })}
      {props.manual.length > 0 && (
        <GroupHeader
          name={t(lang, 'review.manualSection')}
          count={String(props.manual.length)}
          open
          onToggle={() => undefined}
        />
      )}
      {props.manual.map((d) => (
        <Row
          key={keyOf(d)}
          name={`${d.attributeId}${d.path ? `.${d.path}` : ''}`}
          value={
            d.kind === 'manual'
              ? Array.isArray(d.value)
                ? rowsCount(lang, d.value.length)
                : d.value
              : ''
          }
          tags={[{ label: t(lang, 'review.manual'), tone: 'dim' }]}
          indent
          open={openKey === `manual:${keyOf(d)}`}
          onOpen={() => setOpenKey(`manual:${keyOf(d)}`)}
          data-testid="manual"
        />
      ))}
      {props.arrays.length > 0 && (
        <GroupHeader
          name={t(lang, 'review.rowsSection')}
          count={String(props.arrays.length)}
          open
          onToggle={() => undefined}
        />
      )}
      {props.arrays.map((a) => (
        <Row
          key={a.attributeId}
          name={pick(lang, a.name)}
          value={rowsCount(lang, a.rows)}
          tags={a.origin === 'manual' ? [{ label: t(lang, 'review.manual'), tone: 'dim' }] : []}
          indent
          open={openKey === `array:${a.attributeId}`}
          onOpen={() => setOpenKey(`array:${a.attributeId}`)}
          data-testid="array-entry"
          data-attribute={a.attributeId}
        />
      ))}
      <AddValueDialog
        lang={lang}
        category={props.category}
        onAdd={(d) => {
          props.onDecide(d);
          setAddOpen(false);
        }}
        arrayRows={props.arrayRows}
        open={addOpen}
        onOpenChange={setAddOpen}
        hideTrigger
      />
      <RowEditorDialog
        lang={lang}
        attributeId={editingArray ?? ''}
        initial={editingArray ? props.arrayRows(editingArray) : undefined}
        open={editingArray !== null}
        onOpenChange={(open) => {
          if (!open) setEditingArray(null);
        }}
        onSave={(rows) => {
          if (editingArray)
            props.onDecide({ kind: 'manual', attributeId: editingArray, value: rows });
        }}
      />
      {props.children}
    </Instrument>
  );
}
