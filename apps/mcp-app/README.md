# @passwerk/mcp-app

The passwerk workbench as an MCP App (extension `io.modelcontextprotocol/ui`, ADR D-037): the
web app's project, upload, facts, review and gaps/export screens rendered inside the chat of a
host that supports `ui://` resources (Claude Desktop, Claude web). `@passwerk/server` serves it
as `ui://passwerk/workbench.html`; the model opens it by calling `review_passport`.

## How it works

- `src/main.tsx` renders the web app's `App` (`apps/web/src/app/App.tsx`) with a host
  `Platform`: downloads go through the MCP Apps bridge, nothing is persisted, the pdf.js worker
  is inlined.
- `src/bridge.ts` seeds the store from the `review_passport` result, stores the derived draft
  through `validate_passport` one second after the last change, tells the model the draft id
  through `updateModelContext`, and routes exports through the host's `downloadFile` (or
  explains how to get the file from `emit_passport`).
- Core runs inside the iframe. Documents never leave the machine; only the draft reaches the
  server.
- The build is one HTML file (`vite-plugin-singlefile`, about 4.7 MB) copied to
  `packages/server/ui/workbench.html`, which the server tarball ships. The alias `@` points at
  `apps/web/src`, so the views, workflow, i18n and components are the web app's own files.

## Commands

```sh
pnpm build:mcp-app                                  # build and copy into packages/server/ui/
pnpm --filter @passwerk/mcp-app build:host          # the dev-only Playwright host page
pnpm e2e:mcp-app                                    # Playwright: Musterwerk, golden, model context, sovereignty
pnpm --filter @passwerk/mcp-app probe               # throwaway probe for host measurements (see below)
pnpm build:mcp-app                                  # restore the workbench after the probe
```

`pnpm build` first: the Playwright suite starts `packages/server/dist/bin.js --http 3778`.

## The Playwright host

`e2e/host` is what Claude's host does, in a page Playwright can drive: an MCP client over
Streamable HTTP to the passwerk server (same origin, the preview proxies `/mcp`),
`review_passport`, the `ui://` resource into an iframe sandboxed
`allow-scripts allow-same-origin allow-forms`, and an `AppBridge` over postMessage. It is never
shipped.

## The probe

`probe/` is a throwaway page that, served in place of the workbench, measures inside a real
host the facts ADR D-019 left open: file input, pdf.js worker loading, `callServerTool`
payload caps, `downloadFile`. Run it, open Claude Desktop, say "call review_passport", press the
three buttons and pick a file, then paste the output into ADR D-037.

## Boundary

`src/` may import the web app's `views`, `workflow`, `i18n`, `components`, `lib` and the shell
files `app/App`, `app/clock`, `app/ErrorBoundary`, `app/useStore`, `app/platform`. It must never
import `app/persistence.ts`, `app/download.ts`, `idb-keyval` or `node:*`; `test/boundary.test.ts`
enforces it.
