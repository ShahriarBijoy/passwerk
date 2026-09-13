# Releasing passwerk

The release workflow (`.github/workflows/release.yml`) runs on a `v*` tag and is idempotent:
packages already on npm at that version are skipped, so the first publish can be manual.

## One-time setup (owner)

1. **npm organisation.** Create the `passwerk` organisation on npmjs.com (the `@passwerk`
   scope was unclaimed on 2026-09-06) and log in locally: `npm login`.
2. **Repository visibility.** Make `ShahriarBijoy/passwerk` public: the README badges read
   `raw.githubusercontent.com`, the registry entry links the repository, and GHCR pulls need
   the package to be public (Packages settings after the first push).
3. **First publish, by hand.** From a clean `main`:
   ```sh
   pnpm install && pnpm check && pnpm build && pnpm release:pack && pnpm release:smoke
   for p in rules core server cli; do npm publish out/pack/passwerk-$p-0.1.0.tgz --access public; done
   ```
4. **Trusted publishing.** On npmjs.com, for each of `@passwerk/rules`, `@passwerk/core`,
   `@passwerk/server`, `@passwerk/cli`: Settings, Trusted publisher, GitHub Actions,
   repository `ShahriarBijoy/passwerk`, workflow `release.yml`. Later versions then publish
   from CI without a token.
5. **Registry namespace.** `io.github.ShahriarBijoy/*` is granted by GitHub authentication of
   the repository owner. The namespace is case-sensitive and follows the GitHub login exactly,
   and the registry checks that the published `@passwerk/server` declares the same string in
   its `mcpName`, so `server.json`, `package.json` and the Dockerfile label must agree; the workflow uses `mcp-publisher login github-oidc`, which needs
   nothing but `id-token: write`. To publish by hand instead:
   ```sh
   mcp-publisher login github && mcp-publisher publish packages/server/server.json
   ```

## Dry run (after the first merge)

GitHub registers `workflow_dispatch` only for workflows on the default branch, so once
`release.yml` is on `main`, run it once without publishing:

```sh
gh workflow run release.yml -f dry_run=true && gh run watch
```

It runs the checks, packs and smoke-tests the tarballs, builds the image for both platforms
and downloads and checksums `mcp-publisher`, but publishes nothing.

## Every release

1. Bump the version in the four `package.json` files, `packages/server/server.json`,
   `packages/server/src/meta.ts` and `packages/cli/src/meta.ts` (tests enforce agreement), and
   the `passwerk: @passwerk/core <version>` line of `docs/CONFORMANCE.md` (or run `pnpm oracle`;
   CI diffs the regenerated file against the committed one),
   update `README.md` status if needed, merge to `main`.
2. `git tag v<version> && git push origin v<version>`.
3. Watch the workflow: verify (checks, pack smoke), npm, image (amd64 and arm64 on GHCR),
   registry, mcpb (builds and smoke-tests `passwerk-<version>.mcpb`), GitHub release with the
   tarballs and the `.mcpb` attached.
4. Download `passwerk-<version>.mcpb` from the GitHub release and confirm it installs: open it
   in Claude Desktop on macOS and on Windows, and check the hammer icon lists the twelve
   passwerk tools after the restart.
5. Verify from a machine without the repository:
   ```sh
   npx -y @passwerk/server --version
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ShahriarBijoy/passwerk"
   docker run --rm -e PASSWERK_AUTH_TOKEN=x -p 127.0.0.1:3777:3777 ghcr.io/shahriarbijoy/passwerk:<version> &
   curl http://127.0.0.1:3777/healthz
   ```
