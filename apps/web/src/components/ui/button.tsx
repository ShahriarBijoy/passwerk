import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-200 ease-out outline-none select-none focus-visible:border-display disabled:pointer-events-none disabled:text-disabled disabled:border-border [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'rounded-pill border border-display bg-display text-background hover:bg-foreground hover:border-foreground',
        secondary:
          'rounded-pill border border-border-visible bg-transparent text-foreground hover:border-display',
        ghost:
          'rounded-sm border border-transparent bg-transparent text-muted-foreground hover:text-foreground',
        destructive:
          'rounded-pill border border-destructive bg-transparent text-destructive hover:bg-destructive/15',
      },
      size: {
        sm: 'h-7 px-3',
        md: 'h-9 px-4',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

function Button({
  className,
  variant = 'secondary',
  size = 'md',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
