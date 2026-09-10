import type { GapReport, ValidationReport } from '@passwerk/core';
import { explainAttribute } from '@passwerk/core';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type Key, type Language, pick, t } from '../i18n/index.ts';
import { VerdictChip } from './parts/VerdictChip.tsx';
import { GroupHeader } from './shell/GroupHeader.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row, type RowTag } from './shell/Row.tsx';
import { SegmentedBar } from './shell/SegmentedBar.tsx';
import { Sheet } from './shell/Sheet.tsx';

export interface GapsViewProps {
  lang: Language;
  top: ReactNode;
  report: ValidationReport;
  gap: GapReport;
  onFixInReview(attributeId: string): void;
  onContinue(): void;
  children?: ReactNode;
}

type View = 'owner' | 'submodel' | 'findings';
type Item = GapReport['items'][number];
const DOT: Record<Item['status'], 'ok' | 'bad' | 'missing'> = {
  present: 'ok',
  missing: 'missing',
  conflict: 'bad',
  invalid: 'bad',
  not_applicable: 'missing',
};

export function GapsView(props: GapsViewProps) {
  const { lang, report, gap } = props;
  const [view, setView] = useState<View>('owner');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
  const q = search.trim().toLowerCase();
  const show = (i: Item) =>
    (!onlyOpen || i.status !== 'present') &&
    (q === '' ||
      pick(lang, i.name).toLowerCase().includes(q) ||
      i.attributeId.toLowerCase().includes(q));
  const groups = (
    view === 'owner'
      ? gap.byDataOwner.map((g) => ({
          key: `owner-${g.owner.en}`,
          title: pick(lang, g.owner),
          ids: g.attributeIds,
        }))
      : gap.bySubmodel.map((g) => ({
          key: `part-${g.part ?? 'none'}`,
          title: g.submodelIdShort ?? '—',
          ids: g.attributeIds,
        }))
  )
    .map((g) => ({
      ...g,
      items: g.ids.map((id) => byId.get(id)).filter((i): i is Item => i !== undefined && show(i)),
    }))
    .filter((g) => g.items.length > 0);
  const flat = groups.flatMap((g) => g.items);
  const openIndex = flat.findIndex((i) => i.attributeId === openKey);
  const open = openIndex >= 0 ? flat[openIndex] : undefined;
  const openFinding =
    view === 'findings' ? report.findings.find((_, i) => `finding-${i}` === openKey) : undefined;
  const findingKeys = (() => {
    const seen = new Map<string, number>();
    return report.findings.map((f) => {
      const base = `${f.layer}-${f.ruleId}-${f.path}-${f.attributeId ?? ''}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return `${base}#${n}`;
    });
  })();
  const explanation = open ? explainAttribute(open.attributeId) : undefined;
  const bucket = (i: Item): RowTag => ({
    label: t(lang, `gaps.bucket.${i.bucket}` as Key),
    tone: i.bucket === 'required' ? 'default' : 'dim',
  });
  const layers = ['L1', 'L2', 'L3', 'L4'] as const;

  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber
            label={t(lang, 'hero.mandatory')}
            value={String(gap.completeness.mandatory.present)}
            unit={`/ ${gap.completeness.mandatory.total}`}
            data-testid="completeness-mandatory-hero"
          />
          <div className="flex-1 pb-1.5">
            <SegmentedBar
              filled={Number(gap.completeness.mandatory.present)}
              total={Number(gap.completeness.mandatory.total)}
            />
            <div className="label mt-1.5 flex flex-wrap gap-2">
              <span data-testid="completeness-mandatory">
                {gap.completeness.mandatory.present}/{gap.completeness.mandatory.total} (
                {gap.completeness.mandatory.percent} %)
              </span>
              <span>·</span>
              <span data-testid="completeness-overall">
                {t(lang, 'hero.gaps.meta', {
                  present: gap.completeness.overall.present,
                  total: gap.completeness.overall.total,
                })}
              </span>
              <span>·</span>
              <VerdictChip lang={lang} verdict={report.verdict} />
              {layers.map((l) => (
                <span
                  key={l}
                  data-testid={`layer-${l}`}
                  title={t(lang, 'gaps.layer', {
                    layer: l,
                    errors: report.layers[l].errors,
                    warnings: report.layers[l].warnings,
                  })}
                >
                  {l}{' '}
                  <span className={report.layers[l].errors > 0 ? 'text-display' : ''}>
                    {report.layers[l].errors}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </>
      }
      toolbar={
        <>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => {
              if (v) {
                setView(v as View);
                setOpenKey(null);
              }
            }}
          >
            <ToggleGroupItem value="owner" data-testid="gaps-view-owner">
              {t(lang, 'gaps.view.owner')}
            </ToggleGroupItem>
            <ToggleGroupItem value="submodel" data-testid="gaps-view-submodel">
              {t(lang, 'gaps.view.submodel')}
            </ToggleGroupItem>
            <ToggleGroupItem value="findings" data-testid="gaps-view-findings">
              {t(lang, 'gaps.view.findings')} {report.findings.length}
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="flex-1" />
          {view !== 'findings' && (
            <ToggleGroup
              type="single"
              value={onlyOpen ? 'open' : 'all'}
              onValueChange={(v) => v && setOnlyOpen(v === 'open')}
            >
              <ToggleGroupItem value="open" data-testid="gaps-filter-open">
                {t(lang, 'gaps.filter.open')}
              </ToggleGroupItem>
              <ToggleGroupItem value="all" data-testid="gaps-filter-all">
                {t(lang, 'gaps.filter.all')}
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          {view !== 'findings' && (
            <Input
              className="w-28"
              placeholder={t(lang, 'review.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </>
      }
      footer={
        <>
          <span className="label" data-testid="not-legal-advice">
            {t(lang, 'app.notLegalAdvice')}
          </span>
          <span className="flex-1" />
          <Button variant="primary" data-testid="to-export" onClick={props.onContinue}>
            {t(lang, 'gaps.continue')} →
          </Button>
        </>
      }
      sheet={
        open ? (
          <Sheet
            lang={lang}
            open
            title={pick(lang, open.name)}
            meta={`${t(lang, `gaps.status.${open.status}` as Key)} · ${t(lang, `gaps.bucket.${open.bucket}` as Key)}`}
            position={{ index: openIndex + 1, total: flat.length }}
            {...(openIndex > 0
              ? { onPrev: () => setOpenKey(flat[openIndex - 1]?.attributeId ?? null) }
              : {})}
            {...(openIndex < flat.length - 1
              ? { onNext: () => setOpenKey(flat[openIndex + 1]?.attributeId ?? null) }
              : {})}
            onClose={() => setOpenKey(null)}
            actions={
              <Button
                size="sm"
                data-testid="gaps-fix"
                onClick={() => props.onFixInReview(open.attributeId)}
              >
                {t(lang, 'gaps.fixInReview')}
              </Button>
            }
            data-testid="gaps-sheet"
          >
            <p>
              <span className="label">{t(lang, 'gaps.legalRefs')}</span>{' '}
              {open.legalRefs.join(' · ')}
            </p>
            <p className="mt-1">
              <span className="label">{t(lang, 'gaps.nextAction')}</span>{' '}
              {pick(lang, open.suggestedAction)}
            </p>
            {open.verify && <p className="mt-1 text-warning">{t(lang, 'gaps.verify')}</p>}
            {explanation && (
              <details className="mt-2">
                <summary className="label cursor-pointer">{t(lang, 'gaps.explain')}</summary>
                <p className="mt-1">{pick(lang, explanation.explanation)}</p>
              </details>
            )}
          </Sheet>
        ) : openFinding ? (
          <Sheet
            lang={lang}
            open
            title={openFinding.ruleId}
            meta={`${openFinding.layer} · ${openFinding.severity}`}
            onClose={() => setOpenKey(null)}
            {...(openFinding.attributeId && byId.has(openFinding.attributeId)
              ? {
                  actions: (
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="gaps-show-attribute"
                      onClick={() => {
                        setView('owner');
                        setOnlyOpen(false);
                        setOpenKey(openFinding.attributeId ?? null);
                      }}
                    >
                      {t(lang, 'gaps.showAttribute')}
                    </Button>
                  ),
                }
              : {})}
            data-testid="gaps-sheet"
          >
            <p>{pick(lang, openFinding.message)}</p>
            <p className="mt-1 font-mono text-[12px]">{openFinding.path}</p>
          </Sheet>
        ) : undefined
      }
    >
      {view === 'findings'
        ? report.findings.map((f, i) => (
            <Row
              key={findingKeys[i] ?? ''}
              name={pick(lang, f.message)}
              tags={[
                { label: f.layer, tone: f.severity === 'error' ? 'accent' : 'warning' },
                { label: f.ruleId, tone: 'dim' },
              ]}
              open={openKey === `finding-${i}`}
              onOpen={() => setOpenKey(`finding-${i}`)}
              data-testid="finding"
              data-rule={f.ruleId}
              data-attribute={f.attributeId ?? ''}
            />
          ))
        : groups.map((g) => {
            const isOpen = !closed.has(g.key);
            return (
              <div key={g.key} data-testid="gap-group">
                <GroupHeader
                  name={g.title}
                  count={t(lang, 'gaps.openCount', {
                    count: g.items.filter((i) => i.status !== 'present').length,
                  })}
                  open={isOpen}
                  onToggle={() =>
                    setClosed((s) => {
                      const n = new Set(s);
                      if (n.has(g.key)) n.delete(g.key);
                      else n.add(g.key);
                      return n;
                    })
                  }
                />
                <div hidden={!isOpen}>
                  {g.items.map((item) => (
                    <Row
                      key={item.attributeId}
                      name={pick(lang, item.name)}
                      dot={DOT[item.status]}
                      tags={[
                        bucket(item),
                        ...(item.status === 'invalid' || item.status === 'conflict'
                          ? [
                              {
                                label: t(lang, `gaps.status.${item.status}` as Key),
                                tone: 'accent' as const,
                              },
                            ]
                          : []),
                        ...(item.verify
                          ? [{ label: t(lang, 'gaps.verify.short'), tone: 'warning' as const }]
                          : []),
                      ]}
                      indent
                      open={openKey === item.attributeId}
                      onOpen={() => setOpenKey(item.attributeId)}
                      data-testid="gap-item"
                      data-attribute={item.attributeId}
                      data-status={item.status}
                      data-bucket={item.bucket}
                    />
                  ))}
                </div>
              </div>
            );
          })}
      {props.children}
    </Instrument>
  );
}
