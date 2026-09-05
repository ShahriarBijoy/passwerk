import { Badge } from '@/components/ui/badge';

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const variant = value >= 0.7 ? 'default' : value >= 0.4 ? 'secondary' : 'outline';
  return (
    <Badge variant={variant} data-testid="confidence">
      {pct} %
    </Badge>
  );
}
