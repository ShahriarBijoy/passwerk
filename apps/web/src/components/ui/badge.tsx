import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2 font-mono text-[11px] uppercase tracking-[0.04em]',
  {
    variants: {
      variant: {
        default: 'border-border-visible text-foreground',
        secondary: 'border-border text-muted-foreground',
        destructive: 'border-destructive text-destructive',
        outline: 'border-border-visible text-muted-foreground',
        success: 'border-success text-success',
        warning: 'border-warning text-warning',
        ghost: 'border-transparent text-muted-foreground',
        link: 'border-transparent text-foreground underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
