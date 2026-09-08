import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Tests resolve workspace packages to their TypeScript sources, not to dist/.
    alias: {
      '@passwerk/rules': local('./packages/rules/src/index.ts'),
      '@passwerk/core': local('./packages/core/src/index.ts'),
      // The subpath must come before the bare name: aliases match by prefix, in order.
      '@passwerk/server/node': local('./packages/server/src/node.ts'),
      '@passwerk/server': local('./packages/server/src/index.ts'),
      '@passwerk/cli': local('./packages/cli/src/index.ts'),
      '@': local('./apps/web/src'),
    },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'tools/*/test/**/*.test.ts',
      'apps/web/test/**/*.test.{ts,tsx}',
      'apps/mcp-app/test/**/*.test.{ts,tsx}',
    ],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.{ts,tsx}'],
    },
  },
});
