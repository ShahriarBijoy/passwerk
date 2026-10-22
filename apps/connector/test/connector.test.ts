import { describe, expect, it } from 'vitest';
import { isAllowed, parseAllowlist } from '../src/allow.js';
import { githubAuthorizeUrl, s256 } from '../src/github.js';
import { consentPage, escapeHtml, landingPage } from '../src/pages.js';

describe('allowlist', () => {
  it('lets nobody in when empty or missing', () => {
    expect(isAllowed('ShahriarBijoy', '')).toBe(false);
    expect(isAllowed('ShahriarBijoy', undefined)).toBe(false);
    expect(isAllowed('ShahriarBijoy', ' , ')).toBe(false);
  });

  it('matches logins without case and ignores spaces', () => {
    expect(isAllowed('shahriarbijoy', 'ShahriarBijoy, octocat')).toBe(true);
    expect(isAllowed('OCTOCAT', 'ShahriarBijoy, octocat')).toBe(true);
    expect(isAllowed('someone', 'ShahriarBijoy, octocat')).toBe(false);
  });

  it('lets anyone in with *', () => {
    expect(isAllowed('someone', '*')).toBe(true);
    expect(parseAllowlist('a, *').logins).toEqual(new Set(['a']));
  });
});

describe('github', () => {
  it('computes the RFC 7636 appendix B challenge', async () => {
    expect(await s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('asks GitHub for no scopes and uses PKCE', () => {
    const url = new URL(
      githubAuthorizeUrl({
        clientId: 'cid',
        redirectUri: 'https://pw.example/callback',
        state: 's',
        codeChallenge: 'c',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('https://pw.example/callback');
  });
});

describe('pages', () => {
  it('escapes every client-controlled string on the consent page', () => {
    const html = consentPage(
      {
        clientName: '<script>alert(1)</script>',
        clientDomain: 'evil.example"><img src=x>',
        redirectHost: "a'b",
        redirectIsLoopback: false,
      },
      'h"andle',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain(escapeHtml('<script>alert(1)</script>'));
    expect(html).toContain('value="h&#34;andle"');
  });

  it('warns when access goes to a local app', () => {
    const view = { clientName: 'App', redirectHost: 'localhost', redirectIsLoopback: true };
    expect(consentPage(view, 'h')).toContain('an app on your computer');
    expect(consentPage({ ...view, redirectIsLoopback: false }, 'h')).not.toContain(
      'an app on your computer',
    );
  });

  it('shows the MCP URL on the landing page and loads nothing external', () => {
    const html = landingPage('https://pw.example/mcp', '0.1.1');
    expect(html).toContain('https://pw.example/mcp');
    expect(html).not.toMatch(/<script|<link|https:\/\/fonts\./);
  });
});
