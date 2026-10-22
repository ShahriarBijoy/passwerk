/**
 * The hosted passwerk connector (ADR D-046): one Cloudflare Worker that is both the OAuth
 * authorization server Claude signs in to and the MCP endpoint at `/mcp`.
 *
 * - `/mcp` (protected): forwarded to the caller's Durable Object, which runs `createServer`.
 * - `/authorize`, `/callback`: consent page, then GitHub sign-in, then the grant.
 * - `/.well-known/*`, `/oauth/token`, `/oauth/register`: answered by workers-oauth-provider.
 * - `/`, `/healthz`: public landing page and health check.
 *
 * Outbound network happens here only (GitHub sign-in, Client ID Metadata Documents);
 * `@passwerk/core` and `@passwerk/server` still make none.
 */
import OAuthProvider, {
  AuthorizationError,
  type AuthRequest,
  authorizationErrorRedirect,
  CimdFetchError,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { SERVER_NAME, SERVER_VERSION } from '@passwerk/server';
import { isAllowed } from './allow.js';
import type { Env, Props } from './env.js';
import { githubAuthorizeUrl, s256, signInWithGitHub } from './github.js';
import { consentPage, landingPage, messagePage } from './pages.js';

export { PasswerkSession } from './session.js';

/** The one scope: use the passwerk tools. */
const SCOPE = 'mcp';

type AppEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };
type McpContext = ExecutionContext & { props: Props; auth?: { scope: string[] } };

const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { props, auth } = ctx as McpContext;
    if (!auth?.scope.includes(SCOPE)) {
      return Response.json({ error: 'insufficient_scope' }, { status: 403 });
    }
    // Checked on every request as well as at sign-in, so removing a login takes effect at once.
    if (!isAllowed(props.login, env.ALLOWED_GITHUB_LOGINS)) {
      return Response.json(
        { error: 'forbidden', error_description: 'This GitHub account is not allowed here.' },
        { status: 403 },
      );
    }
    const id = env.PASSWERK_SESSION.idFromName(`github:${props.githubId}`);
    return env.PASSWERK_SESSION.get(id).fetch(request);
  },
};

function callbackUrl(env: Env): string {
  return new URL('/callback', env.PUBLIC_URL).href;
}

async function redirectToGitHub(
  env: AppEnv,
  authRequest: AuthRequest,
  headers: Headers,
): Promise<Response> {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const upstream = await env.OAUTH_PROVIDER.beginUpstream(authRequest, {
    data: { verifier },
    headers,
  });
  upstream.headers.set(
    'Location',
    githubAuthorizeUrl({
      clientId: env.GITHUB_CLIENT_ID,
      redirectUri: callbackUrl(env),
      state: upstream.state,
      codeChallenge: await s256(verifier),
    }),
  );
  return new Response(null, { status: 302, headers: upstream.headers });
}

async function authorizeGet(request: Request, env: AppEnv): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const authRequest = await oauth.parseAuthRequest(request);
  if (await oauth.isConsentRemembered(request, authRequest, { secret: env.CONSENT_SECRET })) {
    return redirectToGitHub(env, authRequest, new Headers());
  }
  // describeConsent first: a failed client lookup leaves nothing behind in KV.
  const details = await oauth.describeConsent(authRequest);
  const consent = await oauth.beginConsent(authRequest);
  consent.headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(consentPage(details, consent.handle), { headers: consent.headers });
}

async function authorizePost(request: Request, env: AppEnv): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const form = await request.formData();
  const handle = String(form.get('handle') ?? '');
  if (form.get('decision') !== 'approve') {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }
  const approved = await oauth.approveConsent(request, handle, {
    scope: [SCOPE],
    remember: { secret: env.CONSENT_SECRET },
  });
  return redirectToGitHub(env, approved.request, approved.headers);
}

async function callback(request: Request, env: AppEnv): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const url = new URL(request.url);
  const {
    request: original,
    data,
    headers,
  } = await oauth.finishUpstream<{ verifier: string }>(request);
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error') || !code) {
    headers.set('Location', authorizationErrorRedirect(original, 'access_denied'));
    return new Response(null, { status: 302, headers });
  }
  const user = await signInWithGitHub({
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    code,
    redirectUri: callbackUrl(env),
    verifier: data.verifier,
  });
  if (!isAllowed(user.login, env.ALLOWED_GITHUB_LOGINS)) {
    return messagePage(
      'Not allowed on this deployment',
      `The GitHub account ${user.login} is not on this passwerk deployment's allowlist. Ask the operator to add it, or run passwerk on your own machine.`,
      403,
    );
  }
  const props: Props = { githubId: user.id, login: user.login };
  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    userId: `github-${user.id}`,
    metadata: { login: user.login },
    scope: [SCOPE],
    props,
  });
  headers.set('Location', redirectTo);
  return new Response(null, { status: 302, headers });
}

const app = {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;
    try {
      if (pathname === '/' && method === 'GET') {
        return new Response(landingPage(new URL('/mcp', env.PUBLIC_URL).href, SERVER_VERSION), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (pathname === '/healthz' && method === 'GET') {
        return Response.json({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION });
      }
      if (pathname === '/authorize' && method === 'GET') return await authorizeGet(request, env);
      if (pathname === '/authorize' && method === 'POST') return await authorizePost(request, env);
      if (pathname === '/callback' && method === 'GET') return await callback(request, env);
      return new Response('Not found', { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError) {
        if (error.redirectTo) return Response.redirect(error.redirectTo, 302);
        return messagePage(
          'Sign-in could not continue',
          `${error.description} Please start again from your app.`,
        );
      }
      if (error instanceof CimdFetchError) {
        return messagePage(
          'This app could not be verified',
          'Its client metadata could not be loaded.',
        );
      }
      console.error(
        JSON.stringify({ level: 'error', message: 'authorize failed', data: String(error) }),
      );
      return messagePage(
        'Sign-in failed',
        'Something went wrong while signing in with GitHub.',
        502,
      );
    }
  },
};

let provider: OAuthProvider<Env> | undefined;

/** Built on first request: the resource URL comes from `PUBLIC_URL`, which only `env` knows. */
function getProvider(env: Env): OAuthProvider<Env> {
  if (!provider) {
    const origin = new URL(env.PUBLIC_URL).origin;
    provider = new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: mcpHandler,
      defaultHandler: app as unknown as ExportedHandler<Env>,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      scopesSupported: [SCOPE],
      requiredScopes: [SCOPE],
      resourceMetadata: {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        resource_name: 'passwerk',
      },
      clientIdMetadataDocumentEnabled: true,
    });
  }
  return provider;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return getProvider(env).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
