import { format } from 'date-fns';
import { de, enGB } from 'date-fns/locale';
import { CalendarDaysIcon } from 'lucide-react';
import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type Language, t } from '../../i18n/index.ts';
import { Field } from './Field.tsx';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The ISO string as a local date, or `undefined`: `new Date('2027-03-01')` is UTC midnight. */
export function parseIso(value: string): Date | undefined {
  if (!ISO.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) || date.getMonth() !== m - 1 ? undefined : date;
}

/**
 * A date field in the Nothing tokens: a mono underline input holding the ISO `YYYY-MM-DD` string
 * (typed or pasted), and a ghost control that opens the month beside it. It replaces
 * `<input type="date">`, whose native control draws the browser's own calendar glyph and its own
 * locale order (`mm/dd/yyyy` on a German screen), neither of which this app can style.
 *
 * `onChange` fires only for a value the project can use: a valid ISO date, or the empty string
 * when the reviewer clears the field.
 */
export function DateField({
  lang,
  id,
  label,
  value,
  onChange,
  hint,
  ...rest
}: {
  lang: Language;
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  hint?: string;
  'data-testid': string;
}) {
  const testId = rest['data-testid'];
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  // Only inputs are state: a value that arrives from outside (an imported draft) wins over the
  // text this field is holding, without an effect to copy it across.
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setText(value);
  }
  const selected = parseIso(text);
  return (
    <Field label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <span className="flex items-center gap-2">
        <Input
          id={id}
          data-testid={testId}
          inputMode="numeric"
          placeholder={t(lang, 'shell.date.placeholder')}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            if (next === '' || parseIso(next)) onChange(next);
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            type="button"
            data-testid={`${testId}-open`}
            aria-label={t(lang, 'shell.date.open')}
            className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
          >
            <CalendarDaysIcon className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent data-testid={`${testId}-calendar`}>
            <Calendar
              mode="single"
              locale={lang === 'de' ? de : enGB}
              weekStartsOn={1}
              showWeekNumber
              {...(selected ? { selected, defaultMonth: selected } : {})}
              onSelect={(day) => {
                if (!day) return;
                const iso = format(day, 'yyyy-MM-dd');
                setText(iso);
                onChange(iso);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </span>
    </Field>
  );
}
