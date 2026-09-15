# Install: Codex CLI

Or paste this into Codex and let it do the steps below:
`Install passwerk for me by following https://raw.githubusercontent.com/ShahriarBijoy/passwerk/main/docs/install/agent.md`

## Plugin from GitHub: skill and server together (recommended)

```sh
codex plugin marketplace add ShahriarBijoy/passwerk
codex plugin add passwerk@passwerk
```

No checkout or build: Codex reads the marketplace at this repository's root and installs
`plugins/passwerk`, which carries `skills/passwerk` and runs `npx -y @passwerk/server`. Start a
new session afterwards. Remove it with `codex plugin remove passwerk@passwerk` and
`codex plugin marketplace remove passwerk`. In the ChatGPT desktop app, which includes Codex,
the same plugin opens the passwerk workbench inside a Codex conversation, and its export
buttons save into a `passwerk-exports` folder (ADR D-045). The local build further down is the same plugin,
assembled from a checkout.

## Server only

```sh
codex mcp add passwerk -- npx -y @passwerk/server
```

Or by hand:

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
