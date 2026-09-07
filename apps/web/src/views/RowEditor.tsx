import { getAttribute } from '@passwerk/rules';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Language, pick, t } from '../i18n/index.ts';
import { arrayElementLeaves, type ElementLeaf } from '../workflow/compositeSchema.ts';
import { checkRows, emptyRow, type RowDraft, rowsFromValue } from '../workflow/rows.ts';

function RowFields({
  lang,
  leaves,
  row,
  prefix,
  onChange,
}: {
  lang: Language;
  leaves: ElementLeaf[];
  row: RowDraft;
  /** '' at the top level; `<path>-<index>` inside a nested editor (keeps test ids unique). */
  prefix: string;
  onChange(row: RowDraft): void;
}) {
  const id = (path: string) =>
    prefix === '' ? `rows-field-${path}` : `rows-field-${prefix}-${path}`;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {leaves.map((leaf) =>
        leaf.kind === 'rows' ? (
          <div key={leaf.path} className="grid gap-1 border-l pl-2 md:col-span-2">
            <Label>
              {leaf.path}
              {leaf.required ? ` (${t(lang, 'rows.required')})` : ''}
            </Label>
            {(row.nested[leaf.path] ?? []).map((sub, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: draft rows have no stable id
              <div key={`${leaf.path}-${i}`} className="grid gap-1" data-testid="rows-nested">
                <RowFields
                  lang={lang}
                  leaves={leaf.rows ?? []}
                  row={sub}
                  prefix={prefix === '' ? `${leaf.path}-${i}` : `${prefix}-${leaf.path}-${i}`}
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
              variant="outline"
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
        ) : (
          <div key={leaf.path} className="grid gap-1">
            <Label htmlFor={id(leaf.path)}>
              {leaf.path}
              {leaf.required ? ` (${t(lang, 'rows.required')})` : ''}
              {leaf.kind === 'list' ? ` · ${t(lang, 'rows.list.hint')}` : ''}
            </Label>
            <Input
              id={id(leaf.path)}
              data-testid={id(leaf.path)}
              value={row.fields[leaf.path] ?? ''}
              onChange={(e) =>
                onChange({ ...row, fields: { ...row.fields, [leaf.path]: e.target.value } })
              }
            />
          </div>
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
  const leaves = arrayElementLeaves(attributeId);
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
    const check = checkRows(attributeId, rows);
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
          className="grid gap-2 rounded-md border p-2"
          data-testid="rows-row"
          data-row={i}
        >
          <RowFields
            lang={lang}
            leaves={leaves}
            row={row}
            prefix=""
            onChange={(next) => setRows(rows.map((r, j) => (j === i ? next : r)))}
          />
          <Button
            size="sm"
            variant="ghost"
            data-testid="rows-remove"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            {t(lang, 'rows.remove')}
          </Button>
        </div>
      ))}
      {errors.map((e, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: errors have no stable id
        <p key={`err-${i}`} className="text-destructive text-sm" data-testid="rows-error">
          {e.row < 0 ? e.reason : t(lang, 'rows.error', { row: e.row + 1, reason: e.reason })}
        </p>
      ))}
      <div className="flex gap-2">
        <Button
          variant="outline"
          data-testid="rows-add"
          onClick={() => setRows([...rows, emptyRow()])}
        >
          {t(lang, 'rows.add')}
        </Button>
        <Button data-testid="rows-save" onClick={save}>
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
