import type { Fact } from '@passwerk/core';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { factsCount, type Key, type Language, t } from '../i18n/index.ts';
import { type FactStatus, type FactsFilter, filterFacts } from '../workflow/factsModel.ts';
import type { FactEdit } from '../workflow/state.ts';
import { SourceRef } from './parts/SourceRef.tsx';

export interface FactsViewProps {
  lang: Language;
  facts: Fact[];
  documents: string[];
  edits: Record<string, FactEdit>;
  statuses: Record<string, FactStatus>;
  onEdit(factId: string, edit: FactEdit): void;
  onClearEdit(factId: string): void;
  onMap(fact: Fact): void;
  onContinue(): void;
}

const STATUS_TABS: Array<'all' | FactStatus['status']> = ['all', 'mapped', 'proposed', 'unmapped'];

function FactRow({
  lang,
  fact,
  edit,
  status,
  onEdit,
  onClearEdit,
  onMap,
}: {
  lang: Language;
  fact: Fact;
  edit?: FactEdit;
  status: FactStatus;
  onEdit(factId: string, edit: FactEdit): void;
  onClearEdit(factId: string): void;
  onMap(fact: Fact): void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const displayValue = edit?.value ?? fact.value ?? fact.raw;
  const openEditor = () => {
    // Seed from the current edit (or its absence) rather than once at mount, so a discarded
    // edit does not resurface: a reset between two openings must show the fact's own value.
    setValue(edit?.value ?? fact.value ?? fact.raw);
    setUnit(edit?.unit ?? fact.unit ?? '');
    setEditing(true);
  };
  return (
    <TableRow data-testid="fact-row" data-fact={fact.id} data-status={status.status}>
      <TableCell>{fact.label}</TableCell>
      <TableCell>
        {editing ? (
          <Input
            className="w-32"
            data-testid="fact-edit-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <span className="flex items-center gap-1">
            <span className="font-mono" data-testid="fact-value">
              {displayValue}
            </span>
            {edit && (
              <span className="text-xs" data-testid="fact-edited">
                {t(lang, 'facts.edited')}
              </span>
            )}
          </span>
        )}
      </TableCell>
      <TableCell>
        {editing ? (
          <Input
            className="w-16"
            data-testid="fact-edit-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        ) : (
          (edit?.unit ?? fact.unit ?? '')
        )}
      </TableCell>
      <TableCell>{fact.kind}</TableCell>
      <TableCell>
        <SourceRef lang={lang} source={[fact.source]} />
      </TableCell>
      <TableCell>
        <Badge variant={status.status === 'mapped' ? 'default' : 'outline'}>
          {t(lang, `facts.status.${status.status}` as Key)}
          {status.status === 'mapped' ? ` (${status.attributeId})` : ''}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="flex gap-1">
          {editing ? (
            <Button
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
            <Button size="sm" variant="ghost" data-testid="fact-edit" onClick={openEditor}>
              {t(lang, 'facts.edit')}
            </Button>
          )}
          {edit && (
            <Button
              size="sm"
              variant="ghost"
              data-testid="fact-edit-reset"
              onClick={() => onClearEdit(fact.id)}
            >
              {t(lang, 'facts.reset')}
            </Button>
          )}
          <Button size="sm" variant="secondary" data-testid="fact-map" onClick={() => onMap(fact)}>
            {t(lang, 'facts.map')}
          </Button>
        </span>
      </TableCell>
    </TableRow>
  );
}

export function FactsView(props: FactsViewProps) {
  const { lang } = props;
  const [filter, setFilter] = useState<FactsFilter>({ document: 'all', status: 'all', search: '' });
  // A document can vanish from the list (its file removed, or replaced under a new hash) while
  // the filter still names it; falling back at render time avoids a table stranded empty until
  // the reviewer notices and reselects "All documents" themselves.
  const selectedDocument =
    filter.document !== 'all' && !props.documents.includes(filter.document)
      ? 'all'
      : filter.document;
  const effectiveFilter: FactsFilter = { ...filter, document: selectedDocument };
  const visible = filterFacts(props.facts, props.statuses, effectiveFilter, lang);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(lang, 'facts.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t(lang, 'facts.hint')}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selectedDocument}
            onValueChange={(v) => setFilter((f) => ({ ...f, document: v }))}
          >
            <SelectTrigger data-testid="facts-document">
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
          <Tabs
            value={filter.status}
            onValueChange={(v) => setFilter((f) => ({ ...f, status: v as FactsFilter['status'] }))}
          >
            <TabsList>
              {STATUS_TABS.map((s) => (
                <TabsTrigger key={s} value={s} data-testid={`facts-status-${s}`}>
                  {t(lang, `facts.status.${s}` as Key)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input
            className="w-48"
            data-testid="facts-search"
            placeholder={t(lang, 'facts.search')}
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
          <span data-testid="facts-count">
            {factsCount(lang, visible.length, props.facts.length)}
          </span>
          <Button className="ml-auto" data-testid="facts-continue" onClick={props.onContinue}>
            {t(lang, 'facts.continue')}
          </Button>
        </div>
        {visible.length === 0 ? (
          <p className="text-muted-foreground">{t(lang, 'facts.empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(lang, 'facts.col.label')}</TableHead>
                <TableHead>{t(lang, 'facts.col.value')}</TableHead>
                <TableHead>{t(lang, 'facts.col.unit')}</TableHead>
                <TableHead>{t(lang, 'facts.col.kind')}</TableHead>
                <TableHead>{t(lang, 'facts.col.source')}</TableHead>
                <TableHead>{t(lang, 'facts.col.status')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((f) => (
                <FactRow
                  key={f.id}
                  lang={lang}
                  fact={f}
                  {...(props.edits[f.id] ? { edit: props.edits[f.id] } : {})}
                  status={props.statuses[f.id] ?? { status: 'unmapped' }}
                  onEdit={props.onEdit}
                  onClearEdit={props.onClearEdit}
                  onMap={props.onMap}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
