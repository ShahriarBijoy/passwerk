import type { ExportFile } from '../workflow/exports.ts';

export function downloadFile(file: ExportFile): void {
  const blob = new Blob([file.bytes as BlobPart], { type: file.type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
