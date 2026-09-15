# Install passwerk: instructions for an AI coding agent

**This page is written for you, the agent.** A person pasted a prompt like this into your chat:

```
Install passwerk for me by following
https://raw.githubusercontent.com/ShahriarBijoy/passwerk/main/docs/install/agent.md
```

Follow the steps below in order. Explain each step to the person in one or two plain
sentences before you run it. Show every command before you run it; most hosts will ask the
person to approve it anyway.

passwerk is an offline MCP server with twelve tools and an agent skill for EU Digital Battery
Passports (Regulation (EU) 2023/1542, IDTA 02035). It makes no network calls and needs no API
key once installed. Source: https://github.com/ShahriarBijoy/passwerk

## Rules while installing

- Do not overwrite or delete any existing configuration file. Use the CLI commands below; they
  add entries. If you must edit a config file by hand, show the person the exact lines first.
- Do not change npm settings, Node versions or global package managers, and do not use `sudo`.
  If something is missing, tell the person what to install and stop.
- If a command fails, show the error text and use the "When something fails" section. Do not
  try unrelated workarounds.
- Never ask for, print or store secrets. passwerk needs none.

## Step 1: Work out which host you are running in

| If you are | Go to |
|---|---|
| Claude Code (CLI, IDE extension or desktop app's Code tab) | Step 3A |
| Codex (CLI, IDE extension, or Codex mode in the ChatGPT desktop app) | Step 3B |
| Cursor, OpenCode, VS Code, Windsurf or another MCP-capable agent | Step 3C |
| Claude Desktop (the chat app, not Claude Code) | Step 3D |
| ChatGPT | Step 3E |

If you are not sure, ask the person which app they are using.

## Step 2: Check the prerequisites

Run:

```sh
node --version
npx -y @passwerk/server --version
```

- `node --version` must print **v22.13.0 or newer**. If Node is missing or older, tell the
  person to install the current LTS from https://nodejs.org and stop.
- The second command downloads passwerk once and prints its version (for example `0.1.1`).
  This needs internet access this one time. If it fails, go to "When something fails".

For Step 3D (Claude Desktop) you can skip this step.

## Step 3A: Claude Code

Recommended, the plugin (skill plus tools, updates with the repository):

```sh
claude plugin marketplace add ShahriarBijoy/passwerk
claude plugin install passwerk@passwerk
```

If the person prefers the tools only, or the plugin commands are not available in their
version, use instead:

```sh
claude mcp add passwerk --scope user -- npx -y @passwerk/server
```

Then go to Step 4.

## Step 3B: Codex

Recommended, the plugin (skill plus tools):

```sh
codex plugin marketplace add ShahriarBijoy/passwerk
codex plugin add passwerk@passwerk
```

If the person prefers the tools only, or the plugin commands are not available in their
version, use instead:

```sh
codex mcp add passwerk -- npx -y @passwerk/server
```

In the ChatGPT desktop app (Codex mode), asking to open the passwerk workbench shows it inside
the conversation, and its export buttons save the files into a `passwerk-exports` folder. The
Codex CLI and IDE extension show the tools only; everything works through them.
Then go to Step 4.

## Step 3C: Other MCP-capable agents

Open the matching page and follow it, showing the person the lines you add:

- Cursor: https://github.com/ShahriarBijoy/passwerk/blob/main/docs/install/cursor.md
- OpenCode: https://github.com/ShahriarBijoy/passwerk/blob/main/docs/install/opencode.md
- Any other host: register a **stdio** MCP server named `passwerk` with command `npx` and
  arguments `-y @passwerk/server`, using that host's own MCP settings.

For the workflow, point the agent at the skill: tell the person to add the contents of
https://github.com/ShahriarBijoy/passwerk/blob/main/skills/passwerk/SKILL.md to their agent's
rules or skills, or to keep that link in the project instructions. Then go to Step 4.

## Step 3D: Claude Desktop

You cannot install into Claude Desktop from a chat. Tell the person:

1. Download `passwerk-<version>.mcpb` from https://github.com/ShahriarBijoy/passwerk/releases
2. Open the file. Claude Desktop installs it and asks for a documents folder.
3. Restart Claude Desktop. The twelve passwerk tools appear, and asking Claude to open the
   passwerk workbench shows it inside the chat.

Stop here.

## Step 3E: ChatGPT

- **ChatGPT desktop app (macOS, Windows):** it includes Codex. Tell the person to open a
  **Codex** conversation in the desktop app and paste the install prompt there, then follow
  Step 3B. passwerk then runs on their own machine, the workbench opens inside the conversation
  and exports are saved into a `passwerk-exports` folder (tested 2026-09-15, ADR D-045).
  Chat mode conversations were not tested.
- **ChatGPT on the web or mobile:** tell the person the current state:
  - passwerk's workbench **does run there** through a remote connection (tested 2026-09-15):
    the tools, the six workbench steps and autosave work.
  - **Downloading the exported files does not work there yet.** ChatGPT does not offer the file
    download that the workbench uses.
  - There is **no ready-made install yet**. ChatGPT there only connects to a server on a public
    HTTPS address in developer mode, and the released passwerk server needs changes before it
    accepts ChatGPT without extra glue: a login ChatGPT can use, and a flag that tells ChatGPT
    the tools need no login. The 2026-09-15 test bridged that with a temporary local proxy and
    a tunnel.

  Details: https://github.com/ShahriarBijoy/passwerk/blob/main/docs/DECISIONS.md, ADR D-043.
  Until that lands, suggest the ChatGPT desktop app, Claude Desktop (workbench and downloads),
  Claude Code or Codex. Stop here.

## Step 4: Documents folder (optional)

By default passwerk can read documents and write exports anywhere in the directory the host
starts it in. To limit it to one folder, ask the person for the folder and, **only if they used
the tools-only command**, add the variable to it:

- Claude Code: `claude mcp add passwerk --scope user -e PASSWERK_ROOT=/absolute/path -- npx -y @passwerk/server`
- Codex: `codex mcp add passwerk --env PASSWERK_ROOT=/absolute/path -- npx -y @passwerk/server`

The plugin installs cannot take a folder; tell the person that passwerk then works in the
folder their session runs in.

## Step 5: Start a new session and check

Tell the person to **start a new session** (quit and reopen, or open a new chat), because the
host loads new plugins and servers only at start. Then ask them to paste:

```
Call the passwerk tool list_capabilities and summarise what passwerk can do.
```

A working install answers with passwerk's tools (ingest, extract, map, validate, gap report,
emit, obligations, explain, carrier and the review workbench). Suggest a first real task:

```
Use passwerk to build an EV battery passport from the documents in ./supplier-docs.
```

## When something fails

| Symptom | What to tell the person |
|---|---|
| `ETARGET` or "No matching version found for @passwerk/server@… with a date before …" | Their npm is set to refuse packages younger than a number of days (`min-release-age`). Either wait until the newest passwerk release is old enough, or they change that setting themselves. Do not change it for them. |
| `npx` or `node` not found | Node.js is not installed or not on the PATH. Install the LTS from https://nodejs.org, open a new terminal, retry Step 2. |
| `EACCES`, proxy or certificate errors from npm | The machine's npm cannot reach the registry. Their IT or proxy settings need to allow `registry.npmjs.org` once. |
| `unknown command` for `plugin` or `marketplace` | The host is too old for plugins. Use the tools-only command from Step 3A or 3B, or update the host. |
| A plugin or server named `passwerk` already exists | Ask whether to keep it. To replace it, remove the old one first (see Uninstall), then retry. |
| The tools do not appear after installing | The session was not restarted. Start a new session and retry Step 5. |

Anything else: show the full error and link
https://github.com/ShahriarBijoy/passwerk/issues so the person can report it.

## Uninstall

- Claude Code plugin: `claude plugin uninstall passwerk@passwerk`, then
  `claude plugin marketplace remove passwerk`
- Claude Code tools only: `claude mcp remove passwerk`
- Codex plugin: `codex plugin remove passwerk@passwerk`, then
  `codex plugin marketplace remove passwerk`
- Codex tools only: `codex mcp remove passwerk`
- Claude Desktop: remove the passwerk extension in Claude Desktop's settings

passwerk reports gaps and cites the regulation; it is not legal advice.
