# Install: Claude Code

## Prerequisites

```sh
pnpm install && pnpm build     # Node >= 22.13, pnpm 10
```

## Project-scoped server (this repository)

The root `.mcp.json` registers the built server for anyone who opens the repository:

```json
{
  "mcpServers": {
    "passwerk": {
      "command": "node",
      "args": ["packages/server/dist/bin.js"],
      "env": { "PASSWERK_ROOT": "." }
    }
  }
}
```

Claude Code asks once whether to trust the project's servers. `PASSWERK_ROOT` limits which
paths `ingest_documents` may read and `emit_passport` may write.

## User-scoped server (any directory)

```sh
claude mcp add passwerk -- node /absolute/path/to/passwerk/packages/server/dist/bin.js
```

Add `-e PASSWERK_ROOT=/absolute/path/to/documents` to restrict file access.

## Skill

Copy or symlink `skills/passwerk` into `.claude/skills/` (project) or `~/.claude/skills/`
(user). Claude Code loads `SKILL.md` when the request matches its description.

## First prompt

```
Use the passwerk skill to build an EV battery passport from ./supplier-docs. Answer in German.
```

## Check

```sh
claude mcp list
```

should list `passwerk` as connected. `list_capabilities` is a good first tool call.
