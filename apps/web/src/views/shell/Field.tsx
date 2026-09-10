import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  ...rest
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div className="grid gap-1.5" {...rest}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
