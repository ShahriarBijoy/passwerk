import type * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 border-0 border-b border-border-visible bg-transparent px-0 py-1 font-mono text-sm text-display rounded-none transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-display disabled:text-disabled disabled:border-border aria-invalid:border-destructive file:mr-3 file:inline-flex file:h-7 file:rounded-pill file:border file:border-border-visible file:bg-transparent file:px-3 file:font-mono file:text-[11px] file:uppercase file:tracking-[0.06em] file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
