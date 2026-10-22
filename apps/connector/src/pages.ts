/**
 * The connector's three HTML pages: the landing page, the consent page and a plain message
 * page. Every value that can come from a client (its name, domain, redirect host) is escaped:
 * dynamic registration and Client ID Metadata Documents let an attacker choose those strings.
 * No scripts, no external fonts or images.
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const STYLE = `
:root{color-scheme:dark;--bg:#0b0b0b;--fg:#f2f2f2;--dim:#a0a0a0;--line:#2a2a2a;--accent:#d71921}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f5f5f3;--fg:#111;--dim:#555;--line:#d8d8d4}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 ui-sans-serif,system-ui,sans-serif}
main{max-width:34rem;margin:0 auto;padding:3rem max(1rem,env(safe-area-inset-left)) 3rem max(1rem,env(safe-area-inset-right));display:flex;flex-direction:column;gap:1.25rem}
h1{font-size:1.6rem;line-height:1.2;margin:0}
p{margin:0}
.label{font:500 .72rem/1.2 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.box{border:1px solid var(--line);border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.5rem}
.warn{border-color:var(--accent)}
.de{color:var(--dim);font-size:.92rem}
code{font:.9rem ui-monospace,Menlo,monospace;word-break:break-all}
.actions{display:flex;gap:.75rem;flex-wrap:wrap}
button{font:inherit;font-weight:600;padding:.6rem 1.2rem;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
button.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}
button:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
<main>
${body}
</main>
</html>`;
}

export function landingPage(mcpUrl: string, version: string): string {
  const url = escapeHtml(mcpUrl);
  return page(
    'passwerk connector',
    `<span class="label">passwerk · ${escapeHtml(version)}</span>
<h1>EU Digital Battery Passport tools for your AI assistant</h1>
<p>This is the hosted passwerk MCP server. It turns supplier documents into a battery passport in the AAS format and a gap report with legal references.</p>
<p class="de">Gehosteter passwerk-MCP-Server: aus Lieferantendokumenten wird ein Batteriepass im AAS-Format mit Lückenbericht.</p>
<div class="box">
  <span class="label">Add it to Claude</span>
  <p>Customize → Connectors → Add custom connector, then paste:</p>
  <code>${url}</code>
  <p class="de">Anpassen → Konnektoren → Benutzerdefinierten Konnektor hinzufügen.</p>
</div>
<div class="box">
  <span class="label">Privacy</span>
  <p>You sign in with GitHub. The server keeps your login name and GitHub id, and nothing else from GitHub. Documents you send are processed in memory for your session and are not written to disk. This hosted mode is a convenience; for fully offline use, run passwerk on your own machine.</p>
</div>`,
  );
}

export interface ConsentView {
  clientName: string;
  clientDomain?: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
}

export function consentPage(view: ConsentView, handle: string): string {
  const name = escapeHtml(view.clientName);
  const origin = view.clientDomain
    ? `<p>Published by <strong>${escapeHtml(view.clientDomain)}</strong>.</p>`
    : '<p>This app registered itself. Its name is not verified.</p>';
  const loopback = view.redirectIsLoopback
    ? `<div class="box warn"><p><strong>Access goes to an app on your computer.</strong> Continue only if you just started connecting from it.</p></div>`
    : '';
  return page(
    `Connect ${view.clientName} to passwerk`,
    `<span class="label">passwerk · sign in</span>
<h1>Allow ${name} to use passwerk?</h1>
${origin}
<p>Access will be sent to <strong>${escapeHtml(view.redirectHost)}</strong>.</p>
${loopback}
<div class="box">
  <span class="label">What this allows</span>
  <p>Call the passwerk tools: read the documents you send, build and validate a battery passport draft, and return the files.</p>
  <p class="de">Die passwerk-Werkzeuge nutzen: gesendete Dokumente lesen, einen Batteriepass-Entwurf erstellen und prüfen, Dateien zurückgeben.</p>
</div>
<p>Next, GitHub asks you to sign in. passwerk asks GitHub for no permissions beyond your public profile.</p>
<form method="post" class="actions">
  <input type="hidden" name="handle" value="${escapeHtml(handle)}">
  <button class="primary" name="decision" value="approve">Continue with GitHub</button>
  <button name="decision" value="deny">Cancel</button>
</form>`,
  );
}

export function messagePage(title: string, message: string, status = 400): Response {
  return new Response(page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    },
  });
}
