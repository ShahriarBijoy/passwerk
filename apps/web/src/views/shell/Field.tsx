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
  // `content-start`: two fields side by side keep their inputs on one line even when only one of
  // them carries a hint, instead of the taller row stretching the other's rows apart.
  return (
    <div className="grid content-start gap-1.5" {...rest}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
