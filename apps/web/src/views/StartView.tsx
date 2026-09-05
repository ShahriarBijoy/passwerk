import type { BatteryCategory } from '@passwerk/core';
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
import { type LangText, type Language, t } from '../i18n/index.ts';

const CATEGORIES: BatteryCategory[] = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'];

export interface StartViewProps {
  lang: Language;
  defaultPassportId: string;
  resume?: { category: BatteryCategory; files: string[]; updatedAt: string };
  onStart(meta: { category: BatteryCategory; passportId: string }): void;
  onImport(text: string): { ok: true } | { ok: false; message: LangText };
  onResume(): void;
  onReset(): void;
}

function isUri(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:.+/i.test(s.trim());
}

export function StartView(props: StartViewProps) {
  const { lang } = props;
  const [category, setCategory] = useState<BatteryCategory>('EV');
  const [passportId, setPassportId] = useState(props.defaultPassportId);
  const [error, setError] = useState<string | null>(null);
  const valid = isUri(passportId);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = props.onImport(await file.text());
    setError(r.ok ? null : t(lang, 'start.import.error', { reason: r.message[lang] }));
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {props.resume && (
        <Card data-testid="resume-card" className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t(lang, 'start.resume.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <span>{t(lang, `start.category.${props.resume.category}`)}</span>
            <span className="text-muted-foreground">
              {t(lang, 'start.resume.files', { count: props.resume.files.length })}
            </span>
            <span className="text-muted-foreground">
              {t(lang, 'start.resume.saved', {
                at: new Date(props.resume.updatedAt).toLocaleString(lang),
              })}
            </span>
            <Button onClick={props.onResume}>{t(lang, 'start.resume.button')}</Button>
            <Button variant="outline" onClick={props.onReset}>
              {t(lang, 'app.startOver')}
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t(lang, 'step.start')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="category">{t(lang, 'start.category')}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as BatteryCategory)}>
              <SelectTrigger id="category" data-testid="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(lang, `start.category.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="passportId">{t(lang, 'start.passportId')}</Label>
            <Input
              id="passportId"
              data-testid="passport-id"
              value={passportId}
              onChange={(e) => setPassportId(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t(lang, 'start.passportId.hint')}</p>
            {!valid && (
              <p className="text-destructive text-xs">{t(lang, 'start.passportId.invalid')}</p>
            )}
          </div>
          <Button
            data-testid="start"
            disabled={!valid}
            onClick={() => props.onStart({ category, passportId: passportId.trim() })}
          >
            {t(lang, 'start.begin')}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t(lang, 'start.import')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            data-testid="import-draft"
            type="file"
            accept="application/json,.json"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {error && (
            <p className="text-destructive text-sm" data-testid="import-error">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
