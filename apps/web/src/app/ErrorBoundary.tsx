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
      <div className="grid min-h-[60vh] place-content-center gap-3 px-4 text-center" role="alert">
        <p className="label text-destructive">[ERROR]</p>
        <p className="text-muted-foreground">{t(lang, 'app.error.title')}</p>
        <pre className="max-w-[560px] overflow-auto text-left font-mono text-[12px] text-muted-foreground">
          {this.state.error.message}
        </pre>
        <div className="flex justify-center gap-2">
          <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
            {t(lang, 'app.error.reload')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(details).catch(() => undefined)}
          >
            {t(lang, 'app.error.copy')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
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
