import { defineConfig } from 'vite';

/**
 * Dev-only host page for the Playwright suite (e2e/host). Not part of the workbench build and
 * never shipped. The preview proxies /mcp to the passwerk server so every browser request
 * stays on the preview origin (sovereignty track).
 */
export default defineConfig({
  root: 'e2e/host',
  build: { target: 'es2022', outDir: '../../dist-host', emptyOutDir: true, sourcemap: false },
  preview: {
    port: 4174,
    strictPort: true,
    // changeOrigin: the server's DNS-rebinding guard accepts only its own loopback host header.
    proxy: { '/mcp': { target: 'http://127.0.0.1:3778', changeOrigin: true } },
  },
});
