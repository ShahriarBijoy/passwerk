import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** The web app's source: `views`, `workflow`, `i18n` and `components` are reused unchanged. */
export const webSrc = fileURLToPath(new URL('../web/src', import.meta.url));

const version = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

/**
 * One HTML file with every script, style and asset inlined: an MCP Apps `ui://` resource is
 * delivered as text over the MCP connection and may load nothing from the network (its CSP is
 * empty, see packages/server/src/ui.ts).
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: { alias: { '@': webSrc } },
  define: { __WORKBENCH_VERSION__: JSON.stringify(version) },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    // The inlined pdf.js worker (about 1.3 MB) must not be split into a separate asset.
    assetsInlineLimit: () => true,
  },
});
