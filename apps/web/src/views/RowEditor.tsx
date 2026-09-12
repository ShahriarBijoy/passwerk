import { getAttribute } from '@passwerk/rules';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type Language, pick, t } from '../i18n/index.ts';
import { arrayElementLeaves, type ElementLeaf } from '../workflow/compositeSchema.ts';
import {
  checkRows,
  emptyRow,
  expandLeaves,
  type RowDraft,
  rowsFromValue,
} from '../workflow/rows.ts';
import { Field } from './shell/Field.tsx';

function RowFields({
  lang,
  leaves,
  row,
  prefix,
  domPrefix,
  onChange,
}: {
  lang: Language;
  leaves: ElementLeaf[];
  row: RowDraft;
  /** '' at the top level; `<path>-<index>` inside a nested editor (keeps test ids unique per
   * the data-testid contract — stable across row add/remove, not per-row unique). */
  prefix: string;
  /** Chain of `-r<index>` per row level (outer row, then each nested row), so the DOM `id`
   * (unlike the `data-testid`) is unique per row even though rows share the same schema path. */
  domPrefix: string;
  onChange(row: RowDraft): void;
}) {
  const testId = (path: string) =>
    prefix === '' ? `rows-field-${path}` : `rows-field-${prefix}-${path}`;
  const domId = (path: string) => `${testId(path)}${domPrefix}`;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {leaves.map((leaf) =>
        leaf.kind === 'rows' ? (
          <Field
            key={leaf.path}
            label={`${leaf.path}${leaf.required ? ` (${t(lang, 'rows.required')})` : ''}`}
          >
            <div className="grid gap-1 border-l border-border pl-2 md:col-span-2">
              {(row.nested[leaf.path] ?? []).map((sub, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: draft rows have no stable id
                <div key={`${leaf.path}-${i}`} className="grid gap-1" data-testid="rows-nested">
                  <RowFields
                    lang={lang}
                    leaves={leaf.rows ?? []}
                    row={sub}
                    prefix={prefix === '' ? `${leaf.path}-${i}` : `${prefix}-${leaf.path}-${i}`}
                    domPrefix={`${domPrefix}-r${i}`}
                    onChange={(next) => {
                      const list = [...(row.nested[leaf.path] ?? [])];
                      list[i] = next;
                      onChange({ ...row, nested: { ...row.nested, [leaf.path]: list } });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`rows-remove-${leaf.path}`}
                    onClick={() => {
                      const list = (row.nested[leaf.path] ?? []).filter((_, j) => j !== i);
                      onChange({ ...row, nested: { ...row.nested, [leaf.path]: list } });
                    }}
                  >
                    {t(lang, 'rows.remove')}
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="secondary"
                data-testid={`rows-add-${leaf.path}`}
                onClick={() =>
                  onChange({
                    ...row,
                    nested: {
                      ...row.nested,
                      [leaf.path]: [...(row.nested[leaf.path] ?? []), emptyRow()],
                    },
                  })
                }
              >
                {t(lang, 'rows.add')}
              </Button>
            </div>
          </Field>
        ) : (
          <Field
            key={leaf.path}
            label={`${leaf.path}${leaf.required ? ` (${t(lang, 'rows.required')})` : ''}${
              leaf.kind === 'list' ? ` · ${t(lang, 'rows.list.hint')}` : ''
            }`}
            htmlFor={domId(leaf.path)}
          >
            {leaf.kind === 'list' ? (
              <textarea
                id={domId(leaf.path)}
                data-testid={testId(leaf.path)}
                className="min-h-16 w-full border border-border-visible bg-transparent px-2.5 py-1.5 font-mono text-sm text-display outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-display disabled:text-disabled disabled:border-border"
                value={row.fields[leaf.path] ?? ''}
                onChange={(e) =>
                  onChange({ ...row, fields: { ...row.fields, [leaf.path]: e.target.value } })
                }
              />
            ) : (
              <Input
                id={domId(leaf.path)}
                data-testid={testId(leaf.path)}
                value={row.fields[leaf.path] ?? ''}
                onChange={(e) =>
                  onChange({ ...row, fields: { ...row.fields, [leaf.path]: e.target.value } })
                }
              />
            )}
          </Field>
        ),
      )}
    </div>
  );
}

export function RowEditor({
  lang,
  attributeId,
  initial,
  onSave,
  onCancel,
}: {
  lang: Language;
  attributeId: string;
  initial?: unknown;
  onSave(rows: unknown[]): void;
  onCancel?(): void;
}) {
  // Expanded once from the schema plus whatever `initial` actually carries, so a value with a
  // language beyond `de`/`en` (an imported row's `fr`, say) both renders and round-trips intact
  // instead of being silently dropped on save.
  const leaves = expandLeaves(
    arrayElementLeaves(attributeId),
    Array.isArray(initial) ? initial : [],
  );
  const [rows, setRows] = useState<RowDraft[]>(() => {
    const from = rowsFromValue(leaves, initial);
    return from.length > 0 ? from : [emptyRow()];
  });
  const [errors, setErrors] = useState<{ row: number; reason: string }[]>([]);
  const save = () => {
    if (rows.length === 0) {
      setErrors([{ row: -1, reason: t(lang, 'rows.empty') }]);
      return;
    }
    const check = checkRows(attributeId, rows, leaves);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors([]);
    onSave(check.value);
  };
  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: draft rows have no stable id
          key={`row-${i}`}
          className="grid gap-2 border border-border p-3"
          data-testid="rows-row"
          data-row={i}
        >
          <RowFields
            lang={lang}
            leaves={leaves}
            row={row}
            prefix=""
            domPrefix={`-r${i}`}
            onChange={(next) => {
              setRows(rows.map((r, j) => (j === i ? next : r)));
              setErrors([]);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            data-testid="rows-remove"
            onClick={() => {
              setRows(rows.filter((_, j) => j !== i));
              setErrors([]);
            }}
          >
            {t(lang, 'rows.remove')}
          </Button>
        </div>
      ))}
      {errors.map((e, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: errors have no stable id
        <p key={`err-${i}`} className="text-[13px] text-destructive" data-testid="rows-error">
          {e.row < 0 ? e.reason : t(lang, 'rows.error', { row: e.row + 1, reason: e.reason })}
        </p>
      ))}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          data-testid="rows-add"
          onClick={() => setRows([...rows, emptyRow()])}
        >
          {t(lang, 'rows.add')}
        </Button>
        <Button variant="primary" data-testid="rows-save" onClick={save}>
          {t(lang, 'rows.save')}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t(lang, 'rows.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function RowEditorDialog(props: {
  lang: Language;
  attributeId: string;
  initial?: unknown;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSave(rows: unknown[]): void;
}) {
  const name = getAttribute(props.attributeId)?.name;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[640px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(props.lang, 'rows.title', {
              attribute: name ? pick(props.lang, name) : props.attributeId,
            })}
          </DialogTitle>
        </DialogHeader>
        {props.open && (
          <RowEditor
            lang={props.lang}
            attributeId={props.attributeId}
            initial={props.initial}
            onSave={(rows) => {
              props.onSave(rows);
              props.onOpenChange(false);
            }}
            onCancel={() => props.onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
