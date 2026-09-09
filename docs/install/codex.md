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

Alternatively, install the Codex plugin, which carries the skill and the passwerk MCP server
together, from a checkout:

```sh
pnpm package:codex
cp -r out/codex-plugin ~/plugins/passwerk
cp packaging/codex-plugin/marketplace.json ~/.agents/plugins/marketplace.json
codex plugin add passwerk@personal
```

`pnpm package:codex` prints these same commands with your absolute paths filled in. On
Windows, the equivalent paths under the user profile apply (there is no `~` in `cmd.exe` or
PowerShell; use `$HOME` or `%USERPROFILE%`). `~/.agents/plugins/marketplace.json` is
discovered implicitly, no further registration step is needed. Start a new Codex session
afterwards; the skill and the passwerk tools only appear from then on.

The plugin's `.mcp.json` runs `npx -y @passwerk/server`, and `@passwerk/server` is not
published to npm yet (see `docs/DECISIONS.md` D-039). Until the first publish, `codex plugin
add passwerk@personal` loads the skill but not the MCP tools — `npx` cannot resolve the
package and the server never starts. Use the "From source" or "Server" configuration above for
the tools in the meantime.

## First prompt

```
Read skills/passwerk/SKILL.md, then build an EV battery passport from ./supplier-docs.
```
