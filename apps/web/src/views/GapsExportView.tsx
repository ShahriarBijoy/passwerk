import type { GapReport, ValidationReport } from '@passwerk/core';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Key, type LangText, type Language, pick, t, verdictKey } from '../i18n/index.ts';
import { VerdictChip } from './parts/VerdictChip.tsx';

export interface GapsExportViewProps {
  lang: Language;
  report: ValidationReport;
  gap: GapReport;
  exportError?: LangText;
  onExport(kind: 'aasJson' | 'aasx' | 'draft' | 'gaps' | 'html' | 'qr'): void;
}

type GroupBy = 'owner' | 'submodel';

export function GapsExportView(props: GapsExportViewProps) {
  const { lang, report, gap } = props;
  const [groupBy, setGroupBy] = useState<GroupBy>('owner');
  const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
  const groups: { key: string; title: string; ids: string[] }[] =
    groupBy === 'owner'
      ? gap.byDataOwner.map((g) => ({
          key: `owner-${g.owner.en}`,
          title: pick(lang, g.owner),
          ids: g.attributeIds,
        }))
      : gap.bySubmodel.map((g) => ({
          key: `part-${g.part ?? 'none'}`,
          title: g.submodelIdShort ?? '—',
          ids: g.attributeIds,
        }));
  const pct = (s: string) => Number(s);
  const findingKeys = (() => {
    const seen = new Map<string, number>();
    return report.findings.map((f) => {
      const base = `${f.layer}-${f.ruleId}-${f.path}-${f.attributeId ?? ''}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return `${base}#${n}`;
    });
  })();

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle>{t(lang, 'gaps.title')}</CardTitle>
          <VerdictChip lang={lang} verdict={report.verdict} />
          {(['L1', 'L2', 'L3', 'L4'] as const).map((layer) => (
            <Badge key={layer} variant="outline" data-testid={`layer-${layer}`}>
              {t(lang, 'gaps.layer', {
                layer,
                errors: report.layers[layer].errors,
                warnings: report.layers[layer].warnings,
              })}
            </Badge>
          ))}
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="grid gap-1">
            <span>{t(lang, 'gaps.completeness.mandatory')}</span>
            <span data-testid="completeness-mandatory">
              {gap.completeness.mandatory.present}/{gap.completeness.mandatory.total} (
              {gap.completeness.mandatory.percent} %)
            </span>
            <Progress value={pct(gap.completeness.mandatory.percent)} />
            <span>{t(lang, 'gaps.completeness.overall')}</span>
            <span data-testid="completeness-overall">
              {gap.completeness.overall.present}/{gap.completeness.overall.total} (
              {gap.completeness.overall.percent} %)
            </span>
            <Progress value={pct(gap.completeness.overall.percent)} />
          </div>
          <details>
            <summary>
              {t(lang, 'gaps.findings')} ({report.findings.length})
            </summary>
            <ul className="grid gap-1 py-2 text-sm">
              {report.findings.map((f, i) => (
                <li
                  key={findingKeys[i] ?? ''}
                  data-testid="finding"
                  data-rule={f.ruleId}
                  data-attribute={f.attributeId ?? ''}
                >
                  <Badge variant={f.severity === 'error' ? 'destructive' : 'secondary'}>
                    {f.layer}
                  </Badge>{' '}
                  <code>{f.ruleId}</code> {pick(lang, f.message)}
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle>{t(lang, 'export.title')}</CardTitle>
          <span className="text-muted-foreground text-sm">
            {t(lang, 'export.verdictNote', { verdict: t(lang, verdictKey(report.verdict)) })}
          </span>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button data-testid="export-aasJson" onClick={() => props.onExport('aasJson')}>
            {t(lang, 'export.aasJson')}
          </Button>
          <Button data-testid="export-aasx" onClick={() => props.onExport('aasx')}>
            {t(lang, 'export.aasx')}
          </Button>
          <Button
            variant="outline"
            data-testid="export-draft"
            onClick={() => props.onExport('draft')}
          >
            {t(lang, 'export.draft')}
          </Button>
          <Button
            variant="outline"
            data-testid="export-gaps"
            onClick={() => props.onExport('gaps')}
          >
            {t(lang, 'export.gaps')}
          </Button>
          <Button
            variant="outline"
            data-testid="export-html"
            onClick={() => props.onExport('html')}
          >
            {t(lang, 'export.html')}
          </Button>
          <Button variant="outline" data-testid="export-qr" onClick={() => props.onExport('qr')}>
            {t(lang, 'export.qr')}
          </Button>
          {props.exportError && (
            <p className="w-full text-destructive text-sm">
              {t(lang, 'export.failed', { reason: pick(lang, props.exportError) })}
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
        <TabsList>
          <TabsTrigger value="owner">{t(lang, 'gaps.groupBy.owner')}</TabsTrigger>
          <TabsTrigger value="submodel">{t(lang, 'gaps.groupBy.submodel')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {groups.map((g) => (
        <Card key={g.key}>
          <CardHeader className="py-3">
            <CardTitle className="text-base">{g.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {g.ids.map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              return (
                <div
                  key={id}
                  className="grid gap-1 border-t py-2 text-sm"
                  data-testid="gap-item"
                  data-attribute={id}
                  data-status={item.status}
                  data-bucket={item.bucket}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{pick(lang, item.name)}</span>
                    <Badge variant="outline">{t(lang, `gaps.bucket.${item.bucket}` as Key)}</Badge>
                    <Badge
                      variant={
                        item.status === 'present'
                          ? 'default'
                          : item.status === 'missing'
                            ? 'secondary'
                            : 'destructive'
                      }
                    >
                      {t(lang, `gaps.status.${item.status}` as Key)}
                    </Badge>
                    {item.verify && <Badge variant="outline">{t(lang, 'gaps.verify')}</Badge>}
                  </div>
                  <div className="text-muted-foreground">
                    {t(lang, 'gaps.legalRefs')}: {item.legalRefs.join('; ')}
                  </div>
                  <div>
                    {t(lang, 'gaps.nextAction')}: {pick(lang, item.suggestedAction)}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
      <p className="text-muted-foreground text-xs" data-testid="not-legal-advice">
        {t(lang, 'app.notLegalAdvice')}
      </p>
    </div>
  );
}
