# Install: Codex CLI

## Server

Add to `~/.codex/config.toml` (user) or the project's `.codex/config.toml`:

```toml
[mcp_servers.passwerk]
command = "npx"
args = ["-y", "@passwerk/server"]

[mcp_servers.passwerk.env]
PASSWERK_ROOT = "/absolute/path/to/documents"
```

<!-- verify: the `env` sub-table syntax against the current Codex configuration reference -->

## From source

```sh
pnpm install && pnpm build     # Node >= 22.13, pnpm 10
```

```toml
[mcp_servers.passwerk]
command = "node"
args = ["/absolute/path/to/passwerk/packages/server/dist/bin.js"]

[mcp_servers.passwerk.env]
PASSWERK_ROOT = "/absolute/path/to/documents"
```

## Skill

Codex reads `AGENTS.md`. Point it at the skill so the workflow is loaded on demand:

```markdown
## Battery passports
For any battery passport, Batteriepass or IDTA 02035 request, read `skills/passwerk/SKILL.md`
and follow its workflow with the `passwerk` MCP tools.
```

Alternatively, install the skill into Codex's skills directory once Phase 7c ships the
`.codex-plugin/plugin.json` bundle.

## First prompt

```
Read skills/passwerk/SKILL.md, then build an EV battery passport from ./supplier-docs.
```
