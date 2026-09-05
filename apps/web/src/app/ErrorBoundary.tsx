import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { type Language, t } from '../i18n/index.ts';

interface Props {
  lang: Language;
  onReset(): void;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override render() {
    const { lang } = this.props;
    if (!this.state.error) return this.props.children;
    const details = `${this.state.error.message}\n${this.state.error.stack ?? ''}`;
    return (
      <div className="grid gap-3 rounded-md border border-destructive p-4" role="alert">
        <p className="font-semibold">{t(lang, 'app.error.title')}</p>
        <pre className="overflow-auto text-xs">{this.state.error.message}</pre>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>{t(lang, 'app.error.reload')}</Button>
          <Button
            variant="outline"
            onClick={() => void navigator.clipboard?.writeText(details).catch(() => undefined)}
          >
            {t(lang, 'app.error.copy')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          >
            {t(lang, 'app.startOver')}
          </Button>
        </div>
      </div>
    );
  }
}
