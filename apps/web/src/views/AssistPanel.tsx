import { getAttribute } from '@passwerk/rules';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Key, type Language, pick, t } from '../i18n/index.ts';
import type {
  AssistConfig,
  AssistProvider,
  AssistState,
  AssistSuggestion,
} from '../workflow/assist/types.ts';
import { Field } from './shell/Field.tsx';
import { InlineStatus } from './shell/InlineStatus.tsx';

/** Counts and the literal request, so the reviewer sees what leaves before it leaves. */
export interface AssistDisclosure {
  facts: number;
  proposals: number;
  catalogue: number;
  /** Host only, e.g. the provider's API host or `localhost:11434`. Computed in `app/assist`. */
  endpoint: string;
  /** The request exactly as it will be serialised. */
  json: string;
}

export interface AssistPanelProps {
  lang: Language;
  config: AssistConfig;
  onConfigChange(config: AssistConfig): void;
  remember: boolean;
  onRememberChange(remember: boolean): void;
  disclosure: AssistDisclosure;
  assist: AssistState | null;
  running: boolean;
  error?: string;
  onRun(): void;
  onCancel(): void;
  onAccept(suggestion: AssistSuggestion): void;
  onDismiss(suggestion: AssistSuggestion): void;
}

const PROVIDERS: readonly AssistProvider[] = ['anthropic', 'openai-compatible'];

const attributeLabel = (lang: Language, attributeId: string, path?: string): string => {
  const attribute = getAttribute(attributeId);
  const name = attribute ? `${pick(lang, attribute.name)} (${attributeId})` : attributeId;
  return path === undefined ? name : `${name} · ${path}`;
};

export function AssistPanel(props: AssistPanelProps) {
  const { lang, config, disclosure, assist } = props;
  const [showRequest, setShowRequest] = useState(false);

  const local = config.provider === 'openai-compatible';
  const needsKey = !local && config.apiKey.trim() === '';
  const needsBaseUrl = local && (config.baseUrl ?? '').trim() === '';
  const nothingToAsk = disclosure.facts === 0 && disclosure.proposals === 0;
  const blocked = needsKey || needsBaseUrl || nothingToAsk;
  const set = (patch: Partial<AssistConfig>) => props.onConfigChange({ ...config, ...patch });

  return (
    <div className="grid gap-3" data-testid="assist">
      <p className="text-[13px] text-muted-foreground">{t(lang, 'assist.intro')}</p>
      {/* The promise the whole design rests on, stated where the reviewer decides. */}
      <p className="border border-border p-2 text-[13px]" data-testid="assist-boundary">
        {t(lang, 'assist.boundary')}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t(lang, 'assist.provider')}>
          <Select
            value={config.provider}
            onValueChange={(v) => set({ provider: v as AssistProvider })}
          >
            <SelectTrigger data-testid="assist-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(lang, `assist.provider.${p}` as Key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t(lang, 'assist.model')} htmlFor="assist-model">
          <Input
            id="assist-model"
            value={config.model}
            data-testid="assist-model"
            onChange={(e) => set({ model: e.target.value })}
          />
        </Field>
        {local && (
          <Field
            label={t(lang, 'assist.baseUrl')}
            htmlFor="assist-base-url"
            hint={t(lang, 'assist.baseUrl.hint')}
          >
            <Input
              id="assist-base-url"
              value={config.baseUrl ?? ''}
              placeholder="http://localhost:11434/v1"
              data-testid="assist-base-url"
              onChange={(e) => set({ baseUrl: e.target.value })}
            />
          </Field>
        )}
        <Field
          label={t(lang, 'assist.apiKey')}
          htmlFor="assist-key"
          hint={t(lang, 'assist.apiKey.hint')}
        >
          <Input
            id="assist-key"
            type="password"
            autoComplete="off"
            value={config.apiKey}
            data-testid="assist-key"
            onChange={(e) => set({ apiKey: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-1">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={props.remember}
            data-testid="assist-remember"
            onChange={(e) => props.onRememberChange(e.target.checked)}
          />
          {t(lang, 'assist.remember')}
        </label>
        <p className="text-[12px] text-muted-foreground" data-testid="assist-remember-hint">
          {t(lang, 'assist.remember.hint')}
        </p>
      </div>

      <div className="grid gap-1 border border-border p-2" data-testid="assist-disclosure">
        <span className="text-[13px] font-medium">{t(lang, 'assist.disclosure')}</span>
        <span className="text-[13px]">
          {t(lang, 'assist.disclosure.summary', {
            facts: disclosure.facts,
            proposals: disclosure.proposals,
            catalogue: disclosure.catalogue,
            endpoint: disclosure.endpoint,
          })}
        </span>
        <span className="note">{t(lang, 'assist.disclosure.never')}</span>
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          data-testid="assist-disclosure-toggle"
          onClick={() => setShowRequest((v) => !v)}
        >
          {t(lang, showRequest ? 'assist.disclosure.hide' : 'assist.disclosure.show')}
        </Button>
        {showRequest && (
          <pre
            className="max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground"
            data-testid="assist-request"
          >
            {disclosure.json}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          data-testid="assist-run"
          disabled={props.running || blocked}
          onClick={props.onRun}
        >
          {t(lang, props.running ? 'assist.running' : 'assist.run')}
        </Button>
        {props.running && (
          <Button variant="secondary" data-testid="assist-cancel" onClick={props.onCancel}>
            {t(lang, 'assist.cancel')}
          </Button>
        )}
        {nothingToAsk && (
          <span className="note" data-testid="assist-nothing">
            {t(lang, 'assist.nothing')}
          </span>
        )}
        {needsKey && <span className="text-[13px]">{t(lang, 'assist.needKey')}</span>}
        {needsBaseUrl && <span className="text-[13px]">{t(lang, 'assist.needBaseUrl')}</span>}
      </div>

      {props.error !== undefined && (
        <InlineStatus
          kind="error"
          data-testid="assist-error"
          text={t(lang, 'assist.failed', { reason: props.error })}
        />
      )}

      {assist && (
        <div className="grid gap-3">
          <p className="label" data-testid="assist-ran-at">
            {t(lang, 'assist.ranAt', { model: assist.model, at: assist.runAt })}
          </p>

          <h4 className="text-[13px] font-medium">
            {t(lang, 'assist.suggestions', { count: assist.suggestions.length })}
          </h4>
          {assist.suggestions.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t(lang, 'assist.suggestions.none')}
            </p>
          )}
          {assist.suggestions.map((s) => (
            <div
              key={`${s.factId}|${s.attributeId}|${s.path ?? ''}`}
              className="flex flex-wrap items-center gap-3 border-t border-border py-2"
              data-testid="assist-suggestion"
              data-attribute={s.attributeId}
            >
              <span className="text-[13px] font-medium">
                {attributeLabel(lang, s.attributeId, s.path)}
              </span>
              <span className="text-[13px] text-muted-foreground">{s.reason}</span>
              <span className="ml-auto flex gap-2">
                <Button size="sm" data-testid="assist-accept" onClick={() => props.onAccept(s)}>
                  {t(lang, 'assist.accept')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="assist-dismiss"
                  onClick={() => props.onDismiss(s)}
                >
                  {t(lang, 'assist.dismiss')}
                </Button>
              </span>
            </div>
          ))}

          {assist.critiques.length > 0 && (
            <>
              <h4 className="text-[13px] font-medium">
                {t(lang, 'assist.critiques', { count: assist.critiques.length })}
              </h4>
              {assist.critiques.map((c) => (
                <p
                  key={`${c.factId}|${c.attributeId}|${c.path ?? ''}`}
                  className="text-[13px]"
                  data-testid="assist-critique"
                >
                  <span className="font-medium">{attributeLabel(lang, c.attributeId, c.path)}</span>
                  {': '}
                  {c.reason}
                </p>
              ))}
            </>
          )}

          {assist.discards.length > 0 && (
            <>
              <h4 className="text-[13px] font-medium">
                {t(lang, 'assist.discards', { count: assist.discards.length })}
              </h4>
              <p className="note">{t(lang, 'assist.discards.hint')}</p>
              {assist.discards.map((d) => (
                <p
                  key={`${d.kind}|${d.factId}|${d.attributeId}|${d.reason}`}
                  className="text-[13px] text-muted-foreground"
                  data-testid="assist-discard"
                >
                  {d.attributeId || '—'}: {t(lang, `assist.discard.${d.reason}` as Key)}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
