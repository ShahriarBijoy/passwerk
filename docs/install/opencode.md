# Install: OpenCode

## Server

Add to `opencode.json` in the project (or `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "passwerk": {
      "type": "local",
      "command": ["npx", "-y", "@passwerk/server"],
      "enabled": true,
      "environment": {
        "PASSWERK_ROOT": "/absolute/path/to/documents"
      }
    }
  }
}
```

<!-- verify: key names (`type`, `command` as an array, `environment`) against the current OpenCode MCP documentation -->

## From source

```sh
pnpm install && pnpm build     # Node >= 22.13, pnpm 10
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "passwerk": {
      "type": "local",
      "command": ["node", "/absolute/path/to/passwerk/packages/server/dist/bin.js"],
      "enabled": true,
      "environment": {
        "PASSWERK_ROOT": "/absolute/path/to/documents"
      }
    }
  }
}
```

## Skill

OpenCode reads both `AGENTS.md` and `CLAUDE.md`. Add the pointer from
[codex.md](./codex.md) to `AGENTS.md`, or copy `skills/passwerk` into the agent's skills
directory if your OpenCode version supports Agent Skills.

## First prompt

```
Read skills/passwerk/SKILL.md, then audit ./drafts/supplier-a.draft.json with the passwerk tools.
```
