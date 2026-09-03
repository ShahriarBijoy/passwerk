import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests resolve workspace packages to their TypeScript sources, not to dist/.
    alias: {
      '@passwerk/rules': local('./packages/rules/src/index.ts'),
      '@passwerk/core': local('./packages/core/src/index.ts'),
      '@passwerk/server': local('./packages/server/src/index.ts'),
      '@passwerk/cli': local('./packages/cli/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'tools/*/test/**/*.test.ts',
    ],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
    },
  },
});
