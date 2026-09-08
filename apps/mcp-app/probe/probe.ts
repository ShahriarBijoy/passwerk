/**
 * THROWAWAY. Measures, inside a real MCP Apps host, the facts ADR D-019 left open: file input,
 * pdf.js worker loading, callServerTool payload cap, downloadFile support. Deleted before the
 * Phase 7b PR; the numbers live in ADR D-037.
 */
import { App } from '@modelcontextprotocol/ext-apps';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const out = document.getElementById('out') as HTMLPreElement;
const log = (k: string, v: unknown) => {
  out.textContent += `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}\n`;
};
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;

log('probe', __WORKBENCH_VERSION__);
log('userAgent', navigator.userAgent);
log('origin', location.origin);
log('workerSrc kind', `${workerUrl.slice(0, 40)}... (${workerUrl.length} chars)`);

const app = new App({ name: 'passwerk probe', version: '0' }, {}, { autoResize: true });
app.ontoolresult = (r) => log('toolresult keys', Object.keys(r.structuredContent ?? {}));
app.onhostcontextchanged = (c) => log('hostcontext changed', c);
try {
  await app.connect();
  log('host', app.getHostVersion());
  log('capabilities', app.getHostCapabilities());
  log('context', app.getHostContext());
} catch (e) {
  log('connect failed', String(e));
}

(document.getElementById('file') as HTMLInputElement).onchange = async (e) => {
  for (const f of Array.from((e.target as HTMLInputElement).files ?? [])) {
    const t0 = performance.now();
    const bytes = new Uint8Array(await f.arrayBuffer());
    log('file', { name: f.name, size: bytes.length, ms: Math.round(performance.now() - t0) });
  }
};

button('worker').onclick = async () => {
  try {
    const w = new Worker(workerUrl, { type: 'module' });
    const ok = await new Promise<string>((resolve) => {
      w.onerror = (ev) => resolve(`error: ${ev.message}`);
      setTimeout(() => resolve('constructed, no error within 1.5 s'), 1500);
    });
    log('pdf.js worker from inlined url', ok);
    w.terminate();
  } catch (err) {
    log('pdf.js worker threw', String(err));
  }
  try {
    const blob = new Blob([`self.postMessage('ok')`], { type: 'text/javascript' });
    const w2 = new Worker(URL.createObjectURL(blob));
    const ok = await new Promise<string>((resolve) => {
      w2.onmessage = () => resolve('ok');
      w2.onerror = (ev) => resolve(`error: ${ev.message}`);
      setTimeout(() => resolve('no message within 1.5 s'), 1500);
    });
    log('blob worker', ok);
  } catch (err) {
    log('blob worker threw', String(err));
  }
  try {
    const spec = 'data:text/javascript,export default 1';
    const mod = (await import(/* @vite-ignore */ spec)) as { default: number };
    log('data: dynamic import', mod.default);
  } catch (err) {
    log('data: dynamic import threw', String(err));
  }
};

button('payload').onclick = async () => {
  for (const mb of [1, 4, 16]) {
    const base64 = 'QQ=='.repeat((mb * 1024 * 1024) / 4);
    const t0 = performance.now();
    try {
      const r = await app.callServerTool({
        name: 'ingest_documents',
        arguments: { inline: [{ name: 'probe.txt', base64 }] },
      });
      log(`payload ${mb} MB`, {
        ms: Math.round(performance.now() - t0),
        isError: r.isError === true,
        text: (r.content?.[0] as { text?: string } | undefined)?.text?.slice(0, 80),
      });
    } catch (err) {
      log(`payload ${mb} MB failed`, String(err).slice(0, 200));
    }
  }
};

button('download').onclick = async () => {
  try {
    const r = await app.downloadFile({
      contents: [
        {
          type: 'resource',
          resource: {
            uri: 'passwerk://export/probe.txt',
            mimeType: 'text/plain',
            text: 'passwerk probe',
          },
        },
      ],
    });
    log('downloadFile', r);
  } catch (err) {
    log('downloadFile failed', String(err).slice(0, 200));
  }
};

button('copy').onclick = () => void navigator.clipboard?.writeText(out.textContent ?? '');
