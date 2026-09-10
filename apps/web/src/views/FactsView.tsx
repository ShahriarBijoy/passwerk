import type { Fact } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { type ReactNode, useState } from 'react';
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
import { factsCount, type Key, type Language, pick, t } from '../i18n/index.ts';
import { type FactStatus, type FactsFilter, filterFacts } from '../workflow/factsModel.ts';
import type { FactEdit } from '../workflow/state.ts';
import { SourceRef } from './parts/SourceRef.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row, type RowTag } from './shell/Row.tsx';
import { Sheet } from './shell/Sheet.tsx';

export interface FactsViewProps {
  lang: Language;
  top: ReactNode;
  facts: Fact[];
  documents: string[];
  edits: Record<string, FactEdit>;
  statuses: Record<string, FactStatus>;
  onEdit(factId: string, edit: FactEdit): void;
  onClearEdit(factId: string): void;
  onMap(fact: Fact): void;
  onContinue(): void;
  children?: ReactNode;
}

const STATUS_TABS: Array<'all' | FactStatus['status']> = ['all', 'mapped', 'proposed', 'unmapped'];
const TONE: Record<FactStatus['status'], NonNullable<RowTag['tone']>> = {
  mapped: 'success',
  proposed: 'default',
  unmapped: 'dim',
};

function FactSheet({
  lang,
  fact,
  edit,
  status,
  position,
  onPrev,
  onNext,
  onClose,
  onEdit,
  onClearEdit,
  onMap,
}: {
  lang: Language;
  fact: Fact;
  edit?: FactEdit;
  status: FactStatus;
  position: { index: number; total: number };
  onPrev?(): void;
  onNext?(): void;
  onClose(): void;
  onEdit(id: string, e: FactEdit): void;
  onClearEdit(id: string): void;
  onMap(f: Fact): void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const shown = edit?.value ?? fact.value ?? fact.raw;
  const openEditor = () => {
    setValue(edit?.value ?? fact.value ?? fact.raw);
    setUnit(edit?.unit ?? fact.unit ?? '');
    setEditing(true);
  };
  const mapped = status.status === 'mapped' ? getAttribute(status.attributeId) : undefined;
  return (
    <Sheet
      lang={lang}
      open
      title={fact.label}
      meta={
        <>
          {fact.kind} · <SourceRef lang={lang} source={[fact.source]} />
        </>
      }
      position={position}
      {...(onPrev ? { onPrev } : {})}
      {...(onNext ? { onNext } : {})}
      onClose={onClose}
      actions={
        editing ? (
          <Button
            variant="primary"
            size="sm"
            data-testid="fact-edit-save"
            onClick={() => {
              onEdit(fact.id, { value, ...(unit ? { unit } : {}) });
              setEditing(false);
            }}
          >
            {t(lang, 'facts.save')}
          </Button>
        ) : (
          <>
            <Button size="sm" data-testid="fact-edit" onClick={openEditor}>
              {t(lang, 'facts.editValue')}
            </Button>
            {edit && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="fact-edit-reset"
                onClick={() => onClearEdit(fact.id)}
              >
                {t(lang, 'facts.reset')}
              </Button>
            )}
            <Button size="sm" data-testid="fact-map" onClick={() => onMap(fact)}>
              {t(lang, 'facts.mapTo')}
            </Button>
          </>
        )
      }
      data-testid="fact-sheet"
    >
      {editing ? (
        <div className="flex items-end gap-3">
          <Input
            className="w-40"
            data-testid="fact-edit-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Input
            className="w-20"
            data-testid="fact-edit-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[22px] text-display">{shown}</span>
          <span className="label">{edit?.unit ?? fact.unit ?? ''}</span>
          {edit && (
            <span className="label" data-testid="fact-edited-sheet">
              {t(lang, 'facts.edited')}
            </span>
          )}
        </div>
      )}
      {mapped && (
        <p className="mt-2 text-[12px]">
          {t(lang, 'facts.mappedTo')}: {pick(lang, mapped.name)} ({mapped.id})
        </p>
      )}
      {status.status === 'proposed' && (
        <p className="mt-2 text-[12px]">
          {t(lang, 'facts.feeds')}: {t(lang, 'facts.status.proposed')}
        </p>
      )}
    </Sheet>
  );
}

export function FactsView(props: FactsViewProps) {
  const { lang } = props;
  const [filter, setFilter] = useState<FactsFilter>({ document: 'all', status: 'all', search: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const selectedDocument =
    filter.document !== 'all' && !props.documents.includes(filter.document)
      ? 'all'
      : filter.document;
  const visible = filterFacts(
    props.facts,
    props.statuses,
    { ...filter, document: selectedDocument },
    lang,
  );
  const openIndex = visible.findIndex((f) => f.id === openId);
  const openFact = openIndex >= 0 ? visible[openIndex] : undefined;
  const counts = { proposed: 0, mapped: 0, unmapped: 0 };
  for (const f of props.facts) counts[props.statuses[f.id]?.status ?? 'unmapped'] += 1;
  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber label={t(lang, 'hero.facts')} value={String(props.facts.length)} />
          <span className="label pb-1.5">
            {t(lang, 'hero.facts.meta', { documents: props.documents.length, ...counts })}
          </span>
        </>
      }
      toolbar={
        <>
          <ToggleGroup
            className="shrink-0"
            type="single"
            value={filter.status}
            onValueChange={(v) =>
              v && setFilter((f) => ({ ...f, status: v as FactsFilter['status'] }))
            }
          >
            {STATUS_TABS.map((s) => (
              <ToggleGroupItem key={s} value={s} data-testid={`facts-status-${s}`}>
                {t(lang, `facts.status.${s}` as Key)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {/* The toolbar is one line at every width (spec 3.2): the four filters and the count
              keep their size, the document trigger truncates, and the search takes the slack. */}
          <Select
            value={selectedDocument}
            onValueChange={(v) => setFilter((f) => ({ ...f, document: v }))}
          >
            <SelectTrigger
              className="label ml-auto max-w-44 shrink border-0 [&>span]:truncate"
              data-testid="facts-document"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t(lang, 'facts.document.all')}</SelectItem>
              {props.documents.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="min-w-16 flex-1"
            data-testid="facts-search"
            placeholder={t(lang, 'facts.search')}
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </>
      }
      footer={
        <>
          {/* The four German filter names, the document trigger and the search already fill the
              toolbar at 735 px; the filtered count reads just as well from the footer's status
              slot, which is otherwise empty on this screen. */}
          <span className="label whitespace-nowrap" data-testid="facts-count">
            {factsCount(lang, visible.length, props.facts.length)}
          </span>
          <span className="flex-1" />
          <Button variant="primary" data-testid="facts-continue" onClick={props.onContinue}>
            {t(lang, 'facts.continue')} →
          </Button>
        </>
      }
      sheet={
        openFact && (
          <FactSheet
            key={openFact.id}
            lang={lang}
            fact={openFact}
            {...(props.edits[openFact.id] ? { edit: props.edits[openFact.id] } : {})}
            status={props.statuses[openFact.id] ?? { status: 'unmapped' }}
            position={{ index: openIndex + 1, total: visible.length }}
            {...(openIndex > 0
              ? { onPrev: () => setOpenId(visible[openIndex - 1]?.id ?? null) }
              : {})}
            {...(openIndex < visible.length - 1
              ? { onNext: () => setOpenId(visible[openIndex + 1]?.id ?? null) }
              : {})}
            onClose={() => setOpenId(null)}
            onEdit={props.onEdit}
            onClearEdit={props.onClearEdit}
            onMap={props.onMap}
          />
        )
      }
    >
      {visible.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {t(lang, 'facts.empty')}
        </p>
      ) : (
        visible.map((f) => {
          const status = props.statuses[f.id] ?? { status: 'unmapped' as const };
          const edit = props.edits[f.id];
          return (
            <Row
              key={f.id}
              name={f.label}
              value={<span data-testid="fact-value">{edit?.value ?? f.value ?? f.raw}</span>}
              unit={edit?.unit ?? f.unit ?? ''}
              tags={[
                ...(edit
                  ? [
                      {
                        label: t(lang, 'facts.edited'),
                        tone: 'dim' as const,
                        testId: 'fact-edited',
                      },
                    ]
                  : []),
                {
                  label: t(lang, `facts.status.${status.status}` as Key),
                  tone: TONE[status.status],
                },
              ]}
              open={f.id === openId}
              onOpen={() => setOpenId(f.id)}
              data-testid="fact-row"
              data-fact={f.id}
              data-status={status.status}
            />
          );
        })
      )}
      {props.children}
    </Instrument>
  );
}
