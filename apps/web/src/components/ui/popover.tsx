import { Popover as PopoverPrimitive } from 'radix-ui';
import type * as React from 'react';
import { useContext } from 'react';
import { cn } from '@/lib/utils';
import { InstrumentContext } from '@/views/shell/context.ts';

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/**
 * Portaled into the instrument, like the sheet and the dialogs, so nothing the app opens can
 * escape the frame (spec 3.1). A Nothing panel: `--surface-raised`, `1px --border-visible`, 8 px
 * radius, no shadow.
 */
function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const { container } = useContext(InstrumentContext);
  return (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-auto rounded-md border border-border-visible bg-surface-raised text-foreground outline-none transition-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-200',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
