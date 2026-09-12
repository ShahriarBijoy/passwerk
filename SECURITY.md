# Security policy

passwerk parses documents that arrive from third parties and turns them into a regulatory
artefact. Two things follow: the parsers are the primary attack surface, and the promise that
nothing leaves the machine is a security property, not a marketing line. Reports on either are
welcome.

`PRIVACY.md` describes what passwerk sends and stores, with the tests that enforce it. This
file describes how to report a hole in that, and where the holes would be.

## Reporting a vulnerability

**Do not open a public issue for a vulnerability.**

Report privately through GitHub: the repository's **Security** tab, then **Report a
vulnerability**. That opens a draft advisory only the maintainer can see. If the form is not
available to you, open a normal issue that says only that you have a security report and asks
for a private channel — no details in it — and you will get one.

Useful in a report:

- the version or commit, and how passwerk was installed (npm, Docker image, `.mcpb` bundle,
  Codex plugin, the web app, or the MCP App workbench);
- what you did and what happened, ideally as a reproduction;
- for anything in a parser, the input file itself. A crafted `.xlsx` or PDF is the report.

**What to expect.** passwerk is maintained by one person. Acknowledgement within five working
days, an assessment of whether it is a vulnerability and how severe within ten. Coordinated
disclosure with a default of 90 days from the report to public disclosure, shorter if a fix
ships sooner and longer only by agreement. You will be credited in the advisory unless you ask
not to be.

## Supported versions

As of 2026-09-10 nothing is published: version `0.1.0` is unreleased, and there is no npm
package, container image or release asset to fix. Once published, fixes land on the newest
published version only. Before `1.0.0` there are no backports to older minors.

## The promises, and what breaking them means

Three properties are load-bearing. A credible report that any of them fails is a
vulnerability in this project, not a feature request:

1. **`@passwerk/core` and `@passwerk/server` make no network calls at runtime.** Any runtime
   code path in either package that opens a socket, resolves a name or calls `fetch` counts,
   including one reached only through a malformed input.
2. **`@passwerk/core` and `@passwerk/server` make no model calls.** The two optional model
   features live in `apps/web` and `passwerk chat` and are off until you supply a key.
3. **With a root configured, passwerk reads and writes only inside it.** Any path that escapes
   `--root` / `PASSWERK_ROOT` counts, including through a symlink, a junction, a zip entry name
   or a Windows path quirk.

## Trust boundaries

Reports are most valuable at these five places.

### 1. Document parsers (the main one)

`@passwerk/core` parses attacker-supplied PDF (pdfjs-dist), XLSX and DOCX (fflate plus
fast-xml-parser over the OOXML parts), CSV and TXT. Every input is bounded before allocation
and exceeding a bound is reported as `limit_exceeded` rather than a crash
(`packages/core/src/ingest/types.ts`):

| Bound | Default |
|---|---|
| Largest input file | 64 MiB |
| OOXML zip entries | 5 000 |
| Total inflated XML per package | 256 MiB |
| Occupied cells per workbook | 1 000 000 |
| Compacted grid cells per sheet | 4 000 000 |
| Row / column index | 1 048 576 / 16 384 |

In scope: a document that crashes the process, hangs it, or allocates well past these bounds;
a zip entry name or relationship target that reads or writes outside the input; anything that
reaches code execution. Out of scope: a document that is merely slow or is rejected with
`limit_exceeded` — that is the bound working.

### 2. File-system confinement

`packages/server/src/fs.ts` canonicalises every target with `realpath` and re-checks it against
the canonical root, so a symlink inside the root cannot reach outside it, and a write whose
target is itself a symlink is refused. An escape is a vulnerability.

Note the documented default: started **without** `--root` / `PASSWERK_ROOT`, the server may
read and write anywhere the process can, which is the same authority as the host that launched
it. That is behaviour, not a bug. The `.mcpb` bundle always sets a root — the folder chosen at
install time — and `docs/install/` recommends one everywhere else.

### 3. The Streamable HTTP transport

`/mcp` requires a bearer token (`PASSWERK_AUTH_TOKEN`), compared with `timingSafeEqual`; the
server refuses to start `--http` without one. It binds `127.0.0.1:3777` by default, caps the
request body, and enables the SDK's DNS-rebinding protection with a loopback host allowlist.
`/healthz` is deliberately unauthenticated and returns only status, server name and version.

In scope: authentication bypass, a token that reaches a log, one MCP session reading another's
store, or a request that escapes the body cap.

Note a second documented default: **DNS-rebinding protection is only enabled when the bind
host is loopback.** Binding to `0.0.0.0` or a LAN address turns off the host allowlist, and the
transport is plain HTTP either way. Exposing it beyond localhost is your decision to make
behind a reverse proxy that terminates TLS; a report that a deliberately exposed server is
reachable is not a vulnerability.

### 4. The session store

The server keeps ingested documents and drafts in memory, per connection, bounded to 256
entries and 256 MiB with least-recently-used eviction (`packages/server/src/session.ts`).
Content-addressed ids are not capability tokens by design — anything that lets one connection
reach another connection's bundles or drafts is in scope.

### 5. The two optional model paths

The web app's mapping assist (ADR D-038) and `passwerk chat` are the only features that can
send data anywhere. In scope: the assist sending anything while it is switched off; supplier
file names reaching the assist endpoint, which its per-run fact tokens exist to prevent; an API
key leaking anywhere other than the in-memory holder or, when the reviewer ticks "remember on
this device", its own IndexedDB record; and any value, unit or confidence returned by a model
reaching an emitted passport, which the seven guards and the discard-unread rule exist to
prevent. What each path legitimately sends is spelled out in `PRIVACY.md`.

## Out of scope

- **The accuracy of the legal and regulatory content.** A wrong citation, semanticId or
  threshold is a correctness bug — open a normal issue. Knowledge-base entries flagged
  `verify: true` are known to be awaiting expert review and are listed in `docs/KB_REVIEW.md`.
- **`packages/rules/scripts/fetch.ts`.** It downloads standards artefacts by design, runs only
  when a maintainer regenerates the knowledge base, never at install or runtime, and pins every
  file by sha256 in `packages/rules/PROVENANCE.md`.
- **Third-party endpoints** you point the mapping assist or `passwerk chat` at, and the **host
  application** (Claude Desktop, Claude Code, Codex CLI, Cursor, OpenCode) passwerk runs inside.
- **Missing hardening with no attack behind it.** Welcome as an issue, not an advisory.

## Supply chain

- The four published packages (`@passwerk/rules`, `core`, `server`, `cli`) declare **no install
  scripts** — no `preinstall`, `postinstall` or `prepare`.
- Dependencies are lockfile-pinned. Two are patched
  (`@aas-core-works/aas-core3.0-typescript@1.0.5` for its ESM build, `jsqr@1.4.0`, both in
  `patches/`); the patched AAS SDK is inlined into `dist/vendor/aasCore.js` at build time so a
  consumer of `@passwerk/core` needs no patch of their own.
- The maintainer's pnpm install policy requires a package version to be at least three days old
  before it is adopted — a local `minimumReleaseAge` setting, not something the repository
  enforces on a contributor.
- The `.mcpb` bundle vendors the `rules`, `core` and `server` tarballs installed with
  `--omit=dev --omit=optional`, so installing it touches no network. It is deliberately not
  byte-reproducible (ADR D-039): `mcpb pack` writes zip timestamps. Determinism in passwerk is a
  property of emitted passports, not of the installer.
- The container image is distroless Node 22 running as non-root.
- Releases publish from CI through npm trusted publishing (OIDC, no long-lived token) and the
  image is built for amd64 and arm64 on GHCR. See `docs/RELEASE.md`.

## One thing that is not a security property

passwerk reports gaps and cites Regulation (EU) 2023/1542 and the IDTA templates. It is not
legal advice, and a `valid` verdict is conformance against the pinned templates and the
official `aas-test-engines` oracle — not certification, and not a statement that your passport
satisfies a regulator. `docs/CONFORMANCE.md` records exactly what was replayed and when.
