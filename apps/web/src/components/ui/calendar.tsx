import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import { cn } from '@/lib/utils';

/** The local calendar day as `YYYY-MM-DD`; `toISOString` would shift it by the UTC offset. */
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The shadcn `calendar` item (official registry, MIT) re-skinned in the Nothing tokens: a
 * `--surface-raised` panel, no shadow, 32 px day cells, mono caps weekday headers, the selected
 * day in `--text-display` on the page's black and today outlined in `--border-visible`.
 *
 * Two departures from the generated file, both noted in README.md: the day cell is a plain
 * `button` rather than `components/ui/button` (whose variants are pills sized for a toolbar, not
 * a 32 px square), and the focus handling is a callback ref rather than the generated
 * `useEffect`, which this project does not use.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  const d = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('w-fit p-3', className)}
      classNames={{
        root: cn('w-fit', d.root),
        months: cn('flex flex-col gap-3', d.months),
        month: cn('flex w-full flex-col gap-3', d.month),
        nav: cn('absolute inset-x-0 top-0 flex items-center justify-between', d.nav),
        button_previous: cn(
          'flex size-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:text-disabled [&_svg]:size-3.5',
          d.button_previous,
        ),
        button_next: cn(
          'flex size-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:text-disabled [&_svg]:size-3.5',
          d.button_next,
        ),
        month_caption: cn('flex h-7 items-center justify-center px-7', d.month_caption),
        caption_label: cn('label text-display', d.caption_label),
        month_grid: cn('w-full border-collapse', d.month_grid),
        weekdays: cn('flex', d.weekdays),
        weekday: cn('label w-8 select-none text-center', d.weekday),
        week: cn('mt-1 flex w-full', d.week),
        week_number_header: cn('w-8 select-none', d.week_number_header),
        week_number: cn('label flex w-8 items-center justify-center text-disabled', d.week_number),
        day: cn('size-8 p-0 text-center', d.day),
        today: cn(
          '[&>button]:outline [&>button]:outline-1 [&>button]:outline-border-visible',
          d.today,
        ),
        outside: cn('text-disabled', d.outside),
        disabled: cn('text-disabled', d.disabled),
        hidden: cn('invisible', d.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: c, rootRef, ...rest }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(c)} {...rest} />
        ),
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? <ChevronLeftIcon {...rest} /> : <ChevronRightIcon {...rest} />,
        DayButton: ({ className: c, day, modifiers, ...rest }) => (
          <button
            // A callback ref, not an effect: react-day-picker asks for focus by flipping
            // `modifiers.focused`, and re-attaching the ref on that render is enough to give it.
            ref={(el) => {
              if (el && modifiers['focused']) el.focus();
            }}
            type="button"
            data-day={isoDay(day.date)}
            data-selected={modifiers['selected'] ? 'true' : undefined}
            className={cn(
              'flex size-8 items-center justify-center rounded-sm font-mono text-[13px] text-foreground outline-none hover:bg-surface-raised focus-visible:outline focus-visible:outline-1 focus-visible:outline-border-visible data-[selected=true]:bg-display data-[selected=true]:text-background',
              c,
            )}
            {...rest}
          />
        ),
      }}
      {...props}
    />
  );
}

export { Calendar };
