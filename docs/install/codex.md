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
mkdir -p ~/plugins ~/.agents/plugins
cp -r out/codex-plugin ~/plugins/passwerk
# Seed the marketplace file only if you do not already have one — see below.
[ -f ~/.agents/plugins/marketplace.json ] || cp packaging/codex-plugin/marketplace.json ~/.agents/plugins/marketplace.json
codex plugin add passwerk@personal
```

**If you already have `~/.agents/plugins/marketplace.json`, do not overwrite it** — copying the
template over it would drop every other plugin you have registered. Add this entry to its
existing `plugins` array instead, keeping the file's own `name` and `interface`, and use that
name in place of `personal` in the `codex plugin add` command:

```json
{
  "name": "passwerk",
  "source": { "source": "local", "path": "./plugins/passwerk" },
  "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
  "category": "Productivity"
}
```

`pnpm package:codex` prints these same commands with your absolute paths filled in. On
Windows, the equivalent paths under the user profile apply (there is no `~` in `cmd.exe` or
PowerShell; use `$HOME` or `%USERPROFILE%`, and `New-Item -ItemType Directory -Force` for the
`mkdir -p`). `~/.agents/plugins/marketplace.json` is discovered implicitly, no further
registration step is needed. Start a new Codex session afterwards; the skill and the passwerk
tools only appear from then on.

The plugin's `.mcp.json` runs `npx -y @passwerk/server`, published to npm since 0.1.0. The
first start downloads the package, so the machine needs network access once; after that the
server runs offline from the npm cache. If your npm config sets `min-release-age`, `npx`
refuses a version younger than that many days.

## First prompt

```
Read skills/passwerk/SKILL.md, then build an EV battery passport from ./supplier-docs.
```
