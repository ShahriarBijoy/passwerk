import type { BatteryCategory, ObligationResult } from '@passwerk/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Key, type Language, pick, t } from '../../i18n/index.ts';

const CATEGORIES: BatteryCategory[] = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'];
const NONE = '__none__';

export function ObligationsCard({
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
  const variant =
    result.verdict === 'required'
      ? 'default'
      : result.verdict === 'not_required'
        ? 'secondary'
        : 'destructive';
  const missing = result.missingInput.map((m) => t(lang, `project.missing.${m}` as Key)).join(', ');
  return (
    <Card data-testid="obligations-card">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <CardTitle>{t(lang, 'project.obligations.title')}</CardTitle>
        <Badge variant={variant} data-testid="obligation-verdict" data-verdict={result.verdict}>
          {t(lang, `project.obligations.${result.verdict}`)}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p data-testid="obligation-reason">{pick(lang, result.reason)}</p>
        {missing && (
          <p className="text-destructive">
            {t(lang, 'project.obligations.missing', { fields: missing })}
          </p>
        )}
        {result.category ? (
          <p data-testid="obligation-category">
            {t(lang, 'project.category.derived', {
              category: t(lang, `category.${result.category}`),
            })}
          </p>
        ) : (
          <div className="grid gap-2">
            <p className="text-muted-foreground">{t(lang, 'project.category.voluntary')}</p>
            <Label htmlFor="manual-category">{t(lang, 'project.category')}</Label>
            <Select
              value={manualCategory ?? NONE}
              onValueChange={(v) =>
                onManualCategory(v === NONE ? undefined : (v as BatteryCategory))
              }
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
          </div>
        )}
        <details>
          <summary>
            {t(lang, 'project.timeline')} ({result.timeline.length})
          </summary>
          <ul className="grid gap-1 py-2">
            {result.timeline.map((e) => (
              <li
                key={e.id}
                data-testid="timeline-entry"
                data-id={e.id}
                className="flex flex-wrap items-center gap-2"
              >
                <code>{e.date}</code>
                <span>{pick(lang, e.title)}</span>
                <span className="text-muted-foreground text-xs">{e.legalRef}</span>
                <Badge variant={e.inEffect ? 'default' : 'outline'}>
                  {t(lang, e.inEffect ? 'project.timeline.inEffect' : 'project.timeline.upcoming')}
                </Badge>
                {e.verify && <Badge variant="outline">{t(lang, 'gaps.verify')}</Badge>}
              </li>
            ))}
          </ul>
        </details>
        <p>
          <span className="font-medium">{t(lang, 'project.roleGuidance')}: </span>
          {pick(lang, result.roleGuidance)}
        </p>
        <p className="text-muted-foreground text-xs">
          {t(lang, 'project.sources')}: {result.sources.join('; ')}
        </p>
        <p className="text-muted-foreground text-xs" data-testid="not-legal-advice">
          {t(lang, 'app.notLegalAdvice')}
        </p>
      </CardContent>
    </Card>
  );
}
