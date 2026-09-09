# Install: Claude Desktop

Claude Desktop runs the server locally over stdio, so every document stays on the machine.

## One-click install (MCPB bundle)

Download `passwerk-<version>.mcpb` from the
[GitHub releases page](https://github.com/ShahriarBijoy/passwerk/releases), then open the
downloaded file. Claude Desktop shows an install dialog; confirm it and set the document
folder it asks for (this becomes `PASSWERK_ROOT`). Restart Claude Desktop. The hammer icon
lists the twelve passwerk tools.

No release carries a `.mcpb` yet — the first one ships from the next tag (`docs/DECISIONS.md`
D-039). Until then, build it yourself from a checkout: `pnpm build && pnpm build:mcp-app &&
pnpm release:pack && pnpm package:mcpb` produces `out/mcpb/passwerk-<version>.mcpb`.

The bundle carries the server, `@passwerk/core` and `@passwerk/rules` pinned to one version;
there is nothing to install separately and no `npx` network fetch at startup.

## Server (npx or from source)

Use this JSON configuration instead of the MCPB bundle for an `npx` install or a from-source
checkout.

Open Settings, Developer, Edit Config. The file is `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`).

```json
{
  "mcpServers": {
    "passwerk": {
      "command": "npx",
      "args": ["-y", "@passwerk/server"],
      "env": {
        "PASSWERK_ROOT": "/absolute/path/to/documents"
      }
    }
  }
}
```

Restart Claude Desktop. The hammer icon lists the twelve passwerk tools.

## From source

```sh
pnpm install && pnpm build     # Node >= 22.13, pnpm 10
```

```json
{
  "mcpServers": {
    "passwerk": {
      "command": "node",
      "args": ["/absolute/path/to/passwerk/packages/server/dist/bin.js"],
      "env": {
        "PASSWERK_ROOT": "/absolute/path/to/documents"
      }
    }
  }
}
```

## Documents

Claude Desktop does not pass PDF bytes to a text tool. Either put the documents under
`PASSWERK_ROOT` and name the paths in the conversation:

```
Use the passwerk tools to build an EV battery passport from the files in ./supplier-a.
Validate before calling it complete and give me the gap list in German.
```

or use the workbench below, which has a file input of its own.

## The workbench (MCP App)

Say *open the passwerk workbench* or *review my passport draft*. Claude calls
`review_passport` and Claude Desktop renders the passwerk workbench inside the chat: the same
project, upload, facts, review and gaps/export screens as the web app, in the host's theme and
language (ADR D-037). The configuration above is all it needs; the workbench ships inside
`@passwerk/server`.

- Drop the supplier documents into the file input. They are read inside the workbench and never
  leave the machine; only the passport draft goes to the local server.
- Accept, edit or reject the proposals, fill gaps by hand, read the gap report.
- Every change is synced: Claude knows the current draft id, so *what is still missing?* or
  *emit the AASX into ./out* continue on exactly the draft you see.
- Export: the export buttons save through Claude Desktop when it offers file downloads; otherwise
  the workbench names the draft id and you ask Claude to run `emit_passport` with an `outDir`.

Claude Code and Codex CLI do not render MCP Apps; there `review_passport` returns the draft,
report and gap report as text and the skill workflow applies.
