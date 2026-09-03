# CLAUDE.md: passwerk

@AGENTS.md

The imported file holds the agent-neutral project instructions: what passwerk is, the
repository map, commands, non-negotiable rules, conventions and current status. Everything
there applies to you. This file adds only what is specific to Claude Code.

## Session start ritual

1. Read `docs/BUILD_PLAN.md` section 7 and `docs/DECISIONS.md`, then say in one line which
   phase you are in and what that phase's definition of done is.
2. Check `git status` and the current branch. Never start implementation on `main`. Each
   phase gets its own branch and PR.
3. If the phase needs external artefacts (standards, templates, schemas) and you do not
   have a confirmed URL and checksum, stop and ask before downloading anything.

## How to work here

- Use the `superpowers:test-driven-development` skill for every feature in `core`: write the
  failing test against the golden sample first, then the implementation.
- Use `superpowers:systematic-debugging` before proposing any fix for a failing test or an
  oracle mismatch. An oracle mismatch is a bug in passwerk until proven otherwise.
- Use `superpowers:verification-before-completion` before claiming a phase is done: run
  `pnpm check` and report the real output. Never say "should pass".
- Look up library APIs with the context7 MCP tools rather than from memory, especially for
  `@modelcontextprotocol/sdk`, `@aas-core-works/aas-core3.0-typescript`, Zod 4, Vitest 4
  and Biome 2. These moved recently.
- Domain sources (regulation text, IDTA templates, EC guidance) are not in any library docs.
  Quote them from the bundled artefacts in `packages/rules` or from text the owner pastes.
  Anything else gets `"verify": true`.
- Respect the owner's pnpm `minimumReleaseAge` (3 days). If a freshly published version is
  rejected, pin the previous release rather than adding an exclusion.

## Things Claude tends to get wrong on this project

- Treating the AAS submodel as the internal model. It is not. `PassportDraft` is neutral
  and AAS is one emitter target (see `docs/BUILD_PLAN.md` section 2.3).
- Guessing semanticIds or legal article numbers. Never. Mark `verify: true` and ask.
- Returning `valid: true` from `emit` without re-running L2 and L3 on the emitted output.
- Putting `node:fs` at the top of a `core` module. Core runs in the browser (ADR D-006).
- Using floats for percentages, kg or kWh. Use `decimal.js`.
- Writing only English strings in the knowledge base. Every entry needs `de` and `en`.
- Writing heredocs with many backticks and quotes in one shell call on Windows. Use the
  Write tool for multi-file documentation instead.

## Commits and PRs

Commit as the personal identity (`shahriarbijoy`). Conventional Commits. One PR per phase.
