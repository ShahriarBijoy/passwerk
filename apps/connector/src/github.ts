/**
 * GitHub as the identity step (ADR D-046). passwerk asks for no scopes, so the token can read
 * the public profile only, and it is dropped as soon as the login and id are known.
 */

export interface GitHubUser {
  id: number;
  login: string;
}

export function githubAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('state', options.state);
  url.searchParams.set('code_challenge', options.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('allow_signup', 'true');
  return url.href;
}

/** PKCE S256 challenge for a verifier (RFC 7636). */
export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Exchanges the callback code for a token, reads the user, and returns only id and login. */
export async function signInWithGitHub(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<GitHubUser> {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: options.code,
      redirect_uri: options.redirectUri,
      code_verifier: options.verifier,
    }),
  });
  const token = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(`GitHub sign-in failed: ${token.error ?? tokenResponse.status}`);
  }
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.access_token}`,
      'User-Agent': 'passwerk-connector',
    },
  });
  if (!userResponse.ok) throw new Error(`GitHub user lookup failed: ${userResponse.status}`);
  const user = (await userResponse.json()) as Partial<GitHubUser>;
  if (typeof user.id !== 'number' || typeof user.login !== 'string') {
    throw new Error('GitHub returned no user id');
  }
  return { id: user.id, login: user.login };
}
