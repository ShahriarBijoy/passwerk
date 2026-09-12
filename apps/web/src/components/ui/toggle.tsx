'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as TogglePrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

// Mono caps, the active one underlined (spec 3.2). A filled pill would be the brightest thing
// on the screen and would take the hero's job; a row of outlined pills would be the boxes the
// design spec spends section 2 removing.
const toggleVariants = cva(
  'label inline-flex h-7 items-center whitespace-nowrap border-b-2 border-transparent transition-colors hover:text-foreground data-[state=on]:border-display data-[state=on]:text-display outline-none focus-visible:border-border-visible focus-visible:text-foreground',
  {
    variants: {
      variant: {
        default: '',
        outline: '',
      },
      size: {
        default: '',
        sm: '',
        lg: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
