import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** THROWAWAY: builds probe/ into dist-probe/index.html (see probe/probe.ts). */
const version = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

export default defineConfig({
  root: 'probe',
  plugins: [viteSingleFile()],
  define: { __WORKBENCH_VERSION__: JSON.stringify(`probe-${version}`) },
  build: {
    target: 'es2022',
    outDir: '../dist-probe',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: () => true,
  },
});
