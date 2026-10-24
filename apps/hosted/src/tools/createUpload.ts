import { z } from 'zod';
import type { PlainTool } from '../server.js';
import type { ToolResult } from '../tasks.js';
import { ALLOWED_EXTENSIONS } from '../uploads.js';

const Input = z.object({});

const MB = (bytes: number) => `${bytes / (1024 * 1024)} MB`;

export const createUpload: PlainTool<typeof Input> = {
  name: 'create_upload',
  description:
    'Open an upload slot for supplier documents of one battery model. Returns a PUT URL valid ' +
    'for 15 minutes and a curl command: run it once per local file from a shell, so the file ' +
    'bytes go straight to the server and never through the conversation. Then call run_series ' +
    'with { upload: uploadId, category }. A slot holds at most 20 files (.pdf .xlsx .docx .csv ' +
    '.txt), 10 MB each and 40 MB in all, and is used once.',
  inputSchema: Input,
  call: (_input, { uploads }, { origin }): ToolResult => {
    const slot = uploads.create();
    if (slot === 'store_full') {
      return {
        content: [{ type: 'text', text: 'Too many uploads are open; try again in a few minutes.' }],
        isError: true,
      };
    }
    const { maxFiles, maxFileBytes, maxTotalBytes } = uploads.limits;
    const putUrl = `${origin}/upload/${slot.id}`;
    const howTo = `curl -sS -X PUT --data-binary @"<local file>" "${putUrl}/<file name>"`;
    const text = [
      `Upload slot ${slot.id} is open until ${slot.expiresAt}.`,
      `Upload each file with one command (write a space in the file name as %20):`,
      howTo,
      `At most ${maxFiles} files, ${MB(maxFileBytes)} each, ${MB(maxTotalBytes)} in all; ` +
        `extensions ${ALLOWED_EXTENSIONS.join(' ')}; names of letters, digits, dot, dash, ` +
        'underscore and space, no leading dot.',
      `Then call run_series with { "upload": "${slot.id}", "category": ... }. The slot works once.`,
    ].join('\n');
    return {
      content: [{ type: 'text', text }],
      structuredContent: {
        uploadId: slot.id,
        putUrl,
        expiresAt: slot.expiresAt,
        maxFiles,
        maxFileBytes,
        maxTotalBytes,
        allowedExtensions: [...ALLOWED_EXTENSIONS],
        howTo,
      },
    };
  },
};
