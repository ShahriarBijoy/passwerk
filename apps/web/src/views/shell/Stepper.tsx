import { type Key, type Language, t } from '../../i18n/index.ts';
import type { Step } from '../../workflow/state.ts';

const pad = (i: number) => String(i + 1).padStart(2, '0');

export function Stepper({
  lang,
  steps,
  current,
  reachable,
  onGo,
}: {
  lang: Language;
  steps: readonly Step[];
  current: Step;
  reachable(step: Step): boolean;
  onGo(step: Step): void;
}) {
  return (
    <nav
      aria-label={t(lang, 'step.nav')}
      className="flex min-w-0 items-center gap-3 overflow-hidden"
    >
      {steps.map((step, i) => {
        const active = step === current;
        return (
          <button
            key={step}
            type="button"
            data-testid={`step-${step}`}
            aria-current={active ? 'step' : undefined}
            disabled={!reachable(step)}
            onClick={() => onGo(step)}
            className={[
              'label shrink-0 whitespace-nowrap transition-colors',
              active
                ? 'text-display'
                : reachable(step)
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-disabled',
            ].join(' ')}
          >
            {active ? '[ ' : ''}
            {pad(i)} <span className="max-[640px]:hidden">{t(lang, `step.${step}` as Key)}</span>
            {active ? ' ]' : ''}
          </button>
        );
      })}
    </nav>
  );
}
