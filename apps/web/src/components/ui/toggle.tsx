'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as TogglePrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const toggleVariants = cva(
  'label inline-flex h-7 items-center rounded-pill border border-border-visible px-3 transition-colors hover:text-foreground data-[state=on]:border-display data-[state=on]:bg-display data-[state=on]:text-background outline-none focus-visible:border-display',
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
