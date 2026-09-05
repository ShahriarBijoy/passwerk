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

Endpoints: `POST`, `GET`, `DELETE /mcp` (MCP Streamable HTTP, one session store per
`Mcp-Session-Id`), `GET /healthz` (no auth). Without a token the process exits with code 2.
DNS-rebinding protection is on when bound to a loopback address.

Client configuration (Claude Code):

```sh
claude mcp add --transport http passwerk http://127.0.0.1:3777/mcp --header "Authorization: Bearer <token>"
```

## Privacy

The stdio installs and the web app process everything on the user's machine. The HTTP mode
routes tool calls through the AI host and the operator's endpoint. It is a convenience mode
with an explicit retention policy on the operator's side and is never described as offline.
