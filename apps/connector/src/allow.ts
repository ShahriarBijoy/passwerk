/**
 * Who may use the hosted connector (ADR D-046). `ALLOWED_GITHUB_LOGINS` is a comma-separated
 * list of GitHub logins, compared without case; `*` lets any GitHub account in. An empty or
 * missing value lets nobody in, so a fresh deployment is closed until the operator opens it.
 */
export interface Allowlist {
  anyone: boolean;
  logins: ReadonlySet<string>;
}

export function parseAllowlist(raw: string | undefined): Allowlist {
  const entries = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return { anyone: entries.includes('*'), logins: new Set(entries.filter((s) => s !== '*')) };
}

export function isAllowed(login: string, raw: string | undefined): boolean {
  const list = parseAllowlist(raw);
  return list.anyone || list.logins.has(login.trim().toLowerCase());
}
