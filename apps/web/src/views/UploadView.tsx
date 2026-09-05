import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type Key, type Language, t } from '../i18n/index.ts';
import type { FileSummary } from '../workflow/state.ts';

export interface UploadViewProps {
  lang: Language;
  files: FileSummary[];
  busy: boolean;
  proposalCount: number;
  onFiles(files: File[]): void;
  onRemove(name: string): void;
  onContinue(): void;
}

const ACCEPT = '.pdf,.xlsx,.docx,.csv,.txt,application/pdf,text/csv,text/plain';

export function UploadView(props: UploadViewProps) {
  const { lang } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(lang, 'upload.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t(lang, 'upload.hint')}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <section
          aria-label={t(lang, 'upload.title')}
          className="rounded-md border border-dashed p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            props.onFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <Input
            data-testid="file-input"
            type="file"
            multiple
            accept={ACCEPT}
            disabled={props.busy}
            onChange={(e) => {
              props.onFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          {props.busy && (
            <p className="mt-2 text-sm" data-testid="upload-busy">
              {t(lang, 'upload.busy')}
            </p>
          )}
        </section>
        {props.files.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t(lang, 'upload.empty')}</p>
        ) : (
          <Table data-testid="file-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t(lang, 'upload.col.file')}</TableHead>
                <TableHead>{t(lang, 'upload.col.format')}</TableHead>
                <TableHead>{t(lang, 'upload.col.pages')}</TableHead>
                <TableHead>{t(lang, 'upload.col.lang')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.files.map((f) => (
                <TableRow key={f.name} data-testid="file-row" data-file={f.name}>
                  <TableCell>{f.name}</TableCell>
                  <TableCell>
                    {f.error ? (
                      <span className="text-destructive">
                        {t(lang, `upload.error.${f.error.code}` as Key)}
                      </span>
                    ) : (
                      f.format
                    )}
                  </TableCell>
                  <TableCell data-testid="file-pages">{f.error ? '' : f.pages}</TableCell>
                  <TableCell>{f.error ? '' : f.lang}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => props.onRemove(f.name)}>
                      {t(lang, 'upload.remove')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Button
          data-testid="continue"
          disabled={props.busy || props.files.every((f) => f.error)}
          onClick={props.onContinue}
        >
          {t(lang, 'upload.continue', { count: props.proposalCount })}
        </Button>
      </CardContent>
    </Card>
  );
}
