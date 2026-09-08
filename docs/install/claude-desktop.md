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

Claude Desktop does not pass PDF bytes to a tool. Put the documents under `PASSWERK_ROOT`
and name the paths in the conversation:

```
Use the passwerk tools to build an EV battery passport from the files in ./supplier-a.
Validate before calling it complete and give me the gap list in German.
```

The MCP App (Phase 7b) will add a file input inside the chat.
