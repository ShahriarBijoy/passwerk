# Hosted connector on Cloudflare Workers

`apps/connector` runs passwerk as a public MCP server that people add to Claude by URL, with
sign-in through GitHub (ADR D-046). Use it when you want a link others can paste into
**Customize → Connectors → Add custom connector**. For a private or team setup with one shared
token, [HTTP mode](http.md) is simpler; for offline use, install locally.

## What you need

- A Cloudflare account (`pnpm --filter @passwerk/connector exec wrangler login`)
- A GitHub account to create an OAuth App
- This repository, installed and built

## 1. Build

```sh
pnpm install
pnpm build            # core, rules and server
pnpm build:mcp-app    # packages/server/ui/workbench.html, bundled into the Worker
```

## 2. Create the storage for OAuth

```sh
pnpm --filter @passwerk/connector exec wrangler kv namespace create OAUTH_KV
```

Paste the printed `id` into `apps/connector/wrangler.jsonc` in place of
`REPLACE_WITH_KV_NAMESPACE_ID`.

## 3. Choose the URL and who may sign in

In `apps/connector/wrangler.jsonc`, under `vars`:

| Setting | Value |
|---|---|
| `PUBLIC_URL` | Your Worker's origin, e.g. `https://passwerk-connector.<your-subdomain>.workers.dev` (your subdomain is under Workers & Pages in the Cloudflare dashboard), or a custom domain |
| `ALLOWED_GITHUB_LOGINS` | Comma-separated GitHub logins, or `*` for any GitHub account. Empty lets nobody in |

## 4. Create the GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

- Homepage URL: your `PUBLIC_URL`
- Authorization callback URL: your `PUBLIC_URL` + `/callback`

Copy the client ID and generate a client secret. passwerk requests no GitHub scopes; it reads
the public profile once to learn the login and id, and keeps nothing else.

## 5. Set the secrets and deploy

```sh
cd apps/connector
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
openssl rand -hex 32 | pnpm exec wrangler secret put CONSENT_SECRET
cd ../..
pnpm deploy:connector
```

Check it:

```sh
curl https://<PUBLIC_URL>/healthz
curl https://<PUBLIC_URL>/.well-known/oauth-protected-resource/mcp
```

The second command returns the resource metadata Claude reads first. `POST /mcp` without a
token answers `401` with a `WWW-Authenticate` header that points to it.

## 6. Connect

**Claude (web, desktop, mobile):** Customize → Connectors → Add custom connector, URL
`<PUBLIC_URL>/mcp`. Leave the OAuth client fields empty: Claude identifies itself with its
published client metadata, and the server also accepts automatic registration. Click
**Connect**, approve the passwerk page, then sign in with GitHub. On Team and Enterprise plans an
Owner adds the connector under Organization settings → Connectors.

**Claude Code:**

```sh
claude mcp add --transport http passwerk <PUBLIC_URL>/mcp
```

Then run `/mcp` in Claude Code to sign in.

Documents travel as inline bytes (`ingest_documents.inline`), and exports come back as bytes or
through the workbench. Nothing is written to the server's disk.

## Limits to know

- **Bundle size.** The Worker is about 2.6 MiB gzip, under the Free plan's 3 MiB limit with
  little room to spare. The Paid plan allows 10 MiB.
- **CPU time.** Workers Free has a short CPU limit per request. A large PDF can exceed it; the
  Paid plan raises it.
- **Session memory.** Each user's bundle, facts and draft ids live in memory in their own
  Durable Object. After a quiet spell the object is evicted and old ids stop working; send the
  documents again and the same ids come back.
- **Privacy.** Hosting is a convenience mode: tool calls pass through the AI host and your
  Worker, under your retention policy. Never describe it as offline (ADR D-019).

## Local development

```sh
cp apps/connector/.dev.vars.example apps/connector/.dev.vars   # fill in a second OAuth App
pnpm --filter @passwerk/connector dev                          # http://localhost:8787
```

Use `localhost`, not `127.0.0.1`: the resource metadata is served for the origin in `PUBLIC_URL`
only. The second OAuth App's callback URL is `http://localhost:8787/callback`.
