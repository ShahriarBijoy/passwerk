# Streamable HTTP mode

For hosts that connect over HTTP (Claude web custom connectors, remote agents, a team
deployment) the same server runs as a Streamable HTTP endpoint.

```sh
PASSWERK_AUTH_TOKEN=$(openssl rand -hex 32) \
PASSWERK_ROOT=/srv/passwerk/documents \
node packages/server/dist/bin.js --http 3777 --host 127.0.0.1
```

| Flag or variable | Meaning |
|---|---|
| `--http [port]` | listen on the port (default 3777) |
| `--host` | bind address (default `127.0.0.1`; use `0.0.0.0` only behind a TLS-terminating proxy) |
| `PASSWERK_AUTH_TOKEN` | required; every request to `/mcp` must carry `Authorization: Bearer <token>` |
| `PASSWERK_ROOT` or `--root` | directory `ingest_documents` may read and `emit_passport` may write |
| `PASSWERK_LOG_LEVEL` | `info` (default) or `debug`; logs go to stderr as JSON lines |
| `PASSWERK_LOG_PAYLOADS` | `1` logs tool names with input and output sizes (and payloads at `debug`); off by default |
| `PASSWERK_CLOCK` | ISO date-time used as "now" for every session; for test suites only |

Endpoints: `POST`, `GET`, `DELETE /mcp` (MCP Streamable HTTP, one session store per
`Mcp-Session-Id`), `GET /healthz` (no auth). Without a token the process exits with code 2.
DNS-rebinding protection is on when bound to a loopback address.

Hosts that render MCP Apps (Claude web with a custom connector) show the passwerk workbench
when the model calls `review_passport`: the server serves it as `ui://passwerk/workbench.html`
(ADR D-037). The documents are read inside the workbench iframe; the draft reaches this server.
A hosted connector is a convenience mode with the operator's retention policy, never an
offline mode (ADR D-019).

Client configuration (Claude Code):

```sh
claude mcp add --transport http passwerk http://127.0.0.1:3777/mcp --header "Authorization: Bearer <token>"
```

## Docker

```sh
cp .env.example .env
printf 'PASSWERK_AUTH_TOKEN=%s\n' "$(openssl rand -hex 32)" > .env
mkdir -p documents output
sudo chown 65532:65532 output   # or: chmod 777 output (looser fallback)
docker compose up -d          # or: docker run -e PASSWERK_AUTH_TOKEN=… -p 127.0.0.1:3777:3777 -v ./documents:/data/documents:ro -v ./output:/data/output ghcr.io/shahriarbijoy/passwerk
curl http://127.0.0.1:3777/healthz
```

The image (`ghcr.io/shahriarbijoy/passwerk`, amd64 and arm64) runs the server in HTTP mode on
port 3777 as a non-root user on a distroless Node 22 base; documents are read from
`/data/documents` (`PASSWERK_ROOT=/data`, mounted read-only from `./documents`), so paths in
tool calls are `documents/<file>`, and tools that take `outDir` write under `/data/output`
(mounted from `./output`), e.g. `"outDir": "output"`. Build locally with
`docker build -t passwerk .`. The container runs as the distroless `nonroot` user (UID 65532);
because the root filesystem is `read_only: true` and `./output` is a bind mount that keeps its
host owner, `./output` must be made writable by that user before the first `outDir` write, as
in the `chown`/`chmod` step above. The same privacy note applies: HTTP mode is a convenience
mode, never described as offline.

## Privacy

The stdio installs and the web app process everything on the user's machine. The HTTP mode
routes tool calls through the AI host and the operator's endpoint. It is a convenience mode
with an explicit retention policy on the operator's side and is never described as offline.
