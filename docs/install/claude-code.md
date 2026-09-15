# Install: Claude Code

Or paste this into Claude Code and let it do the steps below:
`Install passwerk for me by following https://raw.githubusercontent.com/ShahriarBijoy/passwerk/main/docs/install/agent.md`

## Plugin: skill and server together (recommended)

```sh
claude plugin marketplace add ShahriarBijoy/passwerk
claude plugin install passwerk@passwerk
```

Inside a session the same works as `/plugin marketplace add ShahriarBijoy/passwerk` and
`/plugin install passwerk@passwerk`. The plugin (`plugins/passwerk` in this repository) carries
`skills/passwerk` and runs `npx -y @passwerk/server`; start a new session afterwards. Remove it
with `claude plugin uninstall passwerk@passwerk` and `claude plugin marketplace remove passwerk`.

## User-scoped server (any directory)

```sh
claude mcp add passwerk -- npx -y @passwerk/server
```

Add `-e PASSWERK_ROOT=/absolute/path/to/documents` to restrict file access.

## From source

```sh
pnpm install && pnpm build     # Node >= 22.13, pnpm 10
```

### Project-scoped server (this repository)

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

### User-scoped server (any directory), built from source

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
