# MCP Inspector

The Inspector exercises the server without an AI host.

```sh
# interactive UI
npx @modelcontextprotocol/inspector npx -y @passwerk/server

# CLI: list tools, resources, prompts
npx @modelcontextprotocol/inspector --cli npx -y @passwerk/server --method tools/list
```

Set `PASSWERK_ROOT` in the environment to point `ingest_documents` at a document folder:

```sh
PASSWERK_ROOT=/absolute/path/to/documents npx @modelcontextprotocol/inspector --cli \
  npx -y @passwerk/server --method tools/call --tool-name list_capabilities --tool-arg lang=de
```

## From source

After `pnpm build`:

```sh
# interactive UI
npx @modelcontextprotocol/inspector node packages/server/dist/bin.js

# CLI: list tools, resources, prompts
npx @modelcontextprotocol/inspector --cli node packages/server/dist/bin.js --method tools/list
npx @modelcontextprotocol/inspector --cli node packages/server/dist/bin.js --method resources/list
npx @modelcontextprotocol/inspector --cli node packages/server/dist/bin.js --method prompts/list

# call a tool
npx @modelcontextprotocol/inspector --cli node packages/server/dist/bin.js \
  --method tools/call --tool-name list_capabilities --tool-arg lang=de

npx @modelcontextprotocol/inspector --cli node packages/server/dist/bin.js \
  --method tools/call --tool-name check_obligations \
  --tool-arg batteryType=EV --tool-arg role=manufacturer --tool-arg placedOnMarketDate=2027-06-01

# read a resource
npx @modelcontextprotocol/inspector --cli node packages/server/dist/bin.js \
  --method resources/read --uri passwerk://reference/cheatsheet
```

Set `PASSWERK_ROOT` in the environment to point `ingest_documents` at a document folder:

```sh
PASSWERK_ROOT=packages/core/test/fixtures npx @modelcontextprotocol/inspector --cli \
  node packages/server/dist/bin.js --method tools/call --tool-name ingest_documents --tool-arg 'paths=["musterwerk"]'
```

Against the HTTP mode: `--transport http --server-url http://127.0.0.1:3777/mcp` with the
bearer header. <!-- verify: the exact header flag of the Inspector CLI for the current version -->
