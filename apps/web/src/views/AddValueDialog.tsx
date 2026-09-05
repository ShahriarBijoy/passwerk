import type { BatteryCategory } from '@passwerk/core';
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
import { type Language, pick, t } from '../i18n/index.ts';
import type { Decision } from '../workflow/state.ts';
import { attributeChoices, compositeLeaves } from './reviewModel.ts';

const WHOLE = '__whole__';

export function AddValueDialog({
  lang,
  category,
  onAdd,
}: {
  lang: Language;
  category: BatteryCategory;
  onAdd(d: Decision): void;
}) {
  const [open, setOpen] = useState(false);
  const [attributeId, setAttributeId] = useState('');
  const [leaf, setLeaf] = useState(WHOLE);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const choices = attributeChoices(category);
  const leaves = attributeId ? compositeLeaves(attributeId) : [];

  const submit = () => {
    if (!attributeId || !value.trim()) return;
    onAdd({
      kind: 'manual',
      attributeId,
      ...(leaf !== WHOLE ? { path: leaf } : {}),
      value: value.trim(),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
    });
    setOpen(false);
    setValue('');
    setUnit('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="add-value">
          {t(lang, 'review.addValue')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(lang, 'review.addValue')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Label>{t(lang, 'review.addValue.attribute')}</Label>
          <Select
            value={attributeId}
            onValueChange={(v) => {
              setAttributeId(v);
              setLeaf(WHOLE);
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
          {leaves.length > 0 && (
            <>
              <Label>{t(lang, 'review.addValue.leaf')}</Label>
              <Select value={leaf} onValueChange={setLeaf}>
                <SelectTrigger data-testid="add-leaf">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE}>{t(lang, 'review.addValue.whole')}</SelectItem>
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
          <Button data-testid="add-submit" onClick={submit}>
            {t(lang, 'review.addValue.add')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
