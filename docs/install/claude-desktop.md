# Install: Claude Desktop

Claude Desktop runs the server locally over stdio, so every document stays on the machine.
Phase 7c will ship a one-click MCPB bundle; until then the JSON configuration below works.

## Server

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
