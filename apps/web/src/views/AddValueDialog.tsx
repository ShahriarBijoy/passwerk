import type { BatteryCategory } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type LangText, type Language, pick, t } from '../i18n/index.ts';
import { isArrayComposite } from '../workflow/compositeSchema.ts';
import type { Decision } from '../workflow/state.ts';
import { validateValue } from '../workflow/validateValue.ts';
import { RowEditor } from './RowEditor.tsx';
import { attributeChoices, compositeLeaves } from './reviewModel.ts';

export interface AddValueDialogProps {
  lang: Language;
  category: BatteryCategory;
  onAdd(d: Decision): void;
  /** Existing rows for an array composite, so picking one that already holds data prefills
   * the row editor instead of silently replacing it. */
  arrayRows?(attributeId: string): unknown;
  /**
   * A fact from the facts screen: value and unit prefilled, provenance kept through `factId`.
   * `attributeId` and `path` are set when the caller already knows the attribute — an accepted
   * assist suggestion (ADR D-038) — so the reviewer confirms a choice instead of hunting for
   * it. The value still comes from the fact, and the same validation runs either way.
   */
  prefill?: { factId: string; value: string; unit?: string; attributeId?: string; path?: string };
  open?: boolean;
  onOpenChange?(open: boolean): void;
  hideTrigger?: boolean;
}

export function AddValueDialog(props: AddValueDialogProps) {
  const { lang, category, onAdd, arrayRows, prefill, hideTrigger } = props;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = props.open ?? ownOpen;
  const setOpen = (v: boolean) => {
    setOwnOpen(v);
    props.onOpenChange?.(v);
  };
  const [attributeId, setAttributeId] = useState(prefill?.attributeId ?? '');
  const [leaf, setLeaf] = useState(
    () =>
      prefill?.path ??
      (prefill?.attributeId ? (compositeLeaves(prefill.attributeId)[0] ?? '') : ''),
  );
  const [value, setValue] = useState(prefill?.value ?? '');
  const [unit, setUnit] = useState(prefill?.unit ?? '');
  const [recordedAt, setRecordedAt] = useState('');
  const [error, setError] = useState<LangText | null>(null);
  const choices = attributeChoices(category);
  const leaves = attributeId ? compositeLeaves(attributeId) : [];
  // A dynamic value is only meaningful with the moment it was measured (PW-PLAUS-011). The
  // reviewer supplies it; the app never invents one from the clock.
  const dynamic = attributeId !== '' && getAttribute(attributeId)?.dynamic === true;

  const submit = () => {
    // A composite is only ever entered through one of its sub-fields, so the leaf is required
    // whenever the attribute has any: there is no "whole value" to type.
    if (!attributeId || !value.trim() || (leaves.length > 0 && leaf === '')) return;
    const path = leaf === '' ? undefined : leaf;
    const stamp = recordedAt.trim() === '' ? undefined : recordedAt;
    const check = validateValue(attributeId, path, value.trim(), stamp);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    onAdd({
      kind: 'manual',
      attributeId,
      ...(path !== undefined ? { path } : {}),
      ...(prefill ? { factId: prefill.factId } : {}),
      value: value.trim(),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
      ...(stamp === undefined ? {} : { recordedAt: new Date(stamp).toISOString() }),
    });
    setOpen(false);
    setValue('');
    setUnit('');
    setRecordedAt('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="secondary" data-testid="add-value">
            {t(lang, 'review.addValue')}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(lang, 'review.addValue')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Label>{t(lang, 'review.addValue.attribute')}</Label>
          <Select
            value={attributeId}
            onValueChange={(v) => {
              setAttributeId(v);
              setLeaf(compositeLeaves(v)[0] ?? '');
              setRecordedAt('');
            }}
          >
            <SelectTrigger data-testid="add-attribute">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {pick(lang, c.name)} ({c.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {attributeId && isArrayComposite(attributeId) ? (
            <RowEditor
              key={attributeId}
              lang={lang}
              attributeId={attributeId}
              initial={arrayRows?.(attributeId)}
              onSave={(rows) => {
                onAdd({
                  kind: 'manual',
                  attributeId,
                  ...(prefill ? { factId: prefill.factId } : {}),
                  value: rows,
                });
                setOpen(false);
                setAttributeId('');
              }}
            />
          ) : (
            <>
              {leaves.length > 0 && (
                <>
                  <Label>{t(lang, 'review.addValue.leaf')}</Label>
                  <Select value={leaf} onValueChange={setLeaf}>
                    <SelectTrigger data-testid="add-leaf">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {leaves.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              <Label>{t(lang, 'review.value')}</Label>
              <Input
                data-testid="add-value-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <Label>{t(lang, 'review.unit')}</Label>
              <Input
                data-testid="add-unit-input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
              {dynamic && (
                <>
                  <Label>{t(lang, 'review.recordedAt')}</Label>
                  <Input
                    data-testid="add-recorded-at"
                    type="datetime-local"
                    value={recordedAt}
                    onChange={(e) => setRecordedAt(e.target.value)}
                  />
                </>
              )}
              {error && (
                <p className="text-destructive text-sm" data-testid="value-error">
                  {pick(lang, error)}
                </p>
              )}
              <Button data-testid="add-submit" onClick={submit}>
                {t(lang, 'review.addValue.add')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
