/** Bindings and settings from `wrangler.jsonc`; the three secrets are set with `wrangler secret put`. */
export interface Env {
  /** Storage for clients, grants and tokens (hashed); required by workers-oauth-provider. */
  OAUTH_KV: KVNamespace;
  PASSWERK_SESSION: DurableObjectNamespace;
  /** The deployment's public origin, e.g. `https://passwerk.example.workers.dev`. */
  PUBLIC_URL: string;
  /** Comma-separated GitHub logins, or `*` for anyone. Empty lets nobody in. */
  ALLOWED_GITHUB_LOGINS: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** 32+ random characters; signs the "remember this approval" cookie. */
  CONSENT_SECRET: string;
}

/** What `completeAuthorization` stores with each grant; handlers get it as `ctx.props`. */
export interface Props {
  githubId: number;
  login: string;
}
