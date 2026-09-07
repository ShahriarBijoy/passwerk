# Install: Cursor

## Server

Project: `.cursor/mcp.json`. User: `~/.cursor/mcp.json`.

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

Enable the server under Settings, MCP. The eleven tools appear in the agent's tool list.

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

## Skill

Cursor has no skill loader; paste the workflow section of `skills/passwerk/SKILL.md` into a
project rule (`.cursor/rules/passwerk.mdc`) so the agent follows the tool order.

<!-- verify: the rules file location and extension against the current Cursor documentation -->

## First prompt

```
Build an EV battery passport from ./supplier-docs with the passwerk tools. Validate before you say it is complete.
```
