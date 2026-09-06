/**
 * The only module in core that names the AAS SDK. `scripts/bundle-vendor.mjs` replaces the
 * compiled `dist/vendor/aasCore.js` with an esbuild bundle that inlines the SDK, because the
 * SDK's ESM build has extensionless relative imports that Node cannot resolve outside this
 * repository's pnpm patch (ADR D-011, D-034). Every other module imports this file.
 */
export * from '@aas-core-works/aas-core3.0-typescript';
