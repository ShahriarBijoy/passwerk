/**
 * Inline stylesheet of the passport sheet, in the workbench's idiom (ADR D-040, D-053): the same
 * colour tokens, mono caps for labels of one to four words, Doto for the hero numbers only, red
 * only for what is wrong. Follows the reader's colour scheme on screen and always prints light.
 * No external resource: the fonts are embedded by htmlSheet.fonts.ts.
 */
import { SHEET_FONTS_CSS } from './htmlSheet.fonts.js';

const LIGHT =
  '--page:#f5f5f5;--surface:#fff;--raised:#f0f0f0;--border:#e8e8e8;--border-visible:#ccc;--text-disabled:#999;--text-2:#666;--text:#1a1a1a;--display:#000;--success:#3e8a4f;--warning:#b8902e';
const DARK =
  '--page:#000;--surface:#111;--raised:#1a1a1a;--border:#222;--border-visible:#333;--text-disabled:#666;--text-2:#999;--text:#e8e8e8;--display:#fff;--success:#4a9e5c;--warning:#d4a843';

export const SHEET_CSS = `
${SHEET_FONTS_CSS}
:root{color-scheme:light;${LIGHT};--accent:#d71921;--sans:"Space Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"Space Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;--dot:"Doto","Space Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;${DARK}}}
*{box-sizing:border-box}
html{background:var(--page);color:var(--text);font:14px/1.5 var(--sans);-webkit-text-size-adjust:100%}
body{margin:0}
h1,h2,p,figure,dl,dd{margin:0}
a{color:inherit;text-decoration-color:var(--border-visible);text-underline-offset:3px}a:hover{text-decoration-color:currentColor}
code{font-family:var(--mono);font-size:12px}
.label{font-family:var(--mono);font-size:11px;font-weight:400;line-height:1.2;letter-spacing:.08em;text-transform:uppercase;color:var(--text-2)}
.note{font-size:13px;line-height:1.5;color:var(--text-2)}
.display{font-family:var(--dot);font-size:40px;font-weight:700;letter-spacing:-.02em;line-height:1;color:var(--display);will-change:transform;-webkit-font-smoothing:antialiased}
.display.long{font-size:26px;line-height:1.15}
input[name=lang]{position:absolute;opacity:0;pointer-events:none}
.bar{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:16px;height:48px;padding:0 24px;background:var(--page);border-bottom:1px solid var(--border)}
.toggle{display:flex;padding:2px;border:1px solid var(--border-visible);border-radius:999px}
.toggle label{cursor:pointer;padding:4px 12px;border-radius:999px}
#lang-de:checked~.bar label[for=lang-de],#lang-en:checked~.bar label[for=lang-en]{background:var(--display);color:var(--page)}
#lang-de:focus-visible~.bar label[for=lang-de],#lang-en:focus-visible~.bar label[for=lang-en]{outline:1px solid var(--border-visible);outline-offset:2px}
#lang-de:checked~.sheet [lang=en]{display:none}#lang-en:checked~.sheet [lang=de]{display:none}
.sheet{max-width:960px;margin:0 auto;padding:40px 24px 64px}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;padding-bottom:32px}
.head h1{margin:8px 0 24px;font-size:32px;font-weight:500;line-height:1.1;letter-spacing:-.01em;color:var(--display)}
.meta{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 24px;align-items:baseline}
.meta dt{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-2)}
.meta dd{min-width:0;overflow-wrap:anywhere}.meta dd code{color:var(--display)}
.qr{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:8px}
.qr svg{display:block;width:136px;height:136px;padding:6px;background:#fff;border-radius:4px}
.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--border-visible);border-bottom:1px solid var(--border)}
.cell{display:flex;flex-direction:column;gap:12px;min-width:0;padding:20px 24px 20px 0}
.cell+.cell{padding-left:24px;border-left:1px solid var(--border)}
.cell .hero{display:flex;align-items:baseline;gap:8px;min-height:40px}
.cell .unit{font-family:var(--mono);font-size:22px;color:var(--text-2)}
.cell[data-verdict=invalid] .display{color:var(--accent)}.cell[data-verdict=valid_with_warnings] .display{color:var(--warning)}
.cell .tally{display:flex;flex-wrap:wrap;gap:4px 16px}
.seg{display:flex;gap:2px;height:8px}.seg i{flex:1;background:var(--border)}.seg i.on{background:var(--display)}
.lede{padding:16px 0 8px}
.section{display:flex;justify-content:space-between;gap:16px;margin:40px 0 8px}
details.group{border-top:1px solid var(--border-visible)}
details.group>summary{display:flex;align-items:center;gap:12px;min-height:44px;cursor:pointer;list-style:none}
details.group>summary::-webkit-details-marker{display:none}
details.group>summary::after{content:"\\203A";width:12px;text-align:right;color:var(--text-disabled)}
details.group[open]>summary::after{content:"\\25BE"}
details.group>summary:hover{background:var(--raised)}
details.group>summary .name{flex:1;min-width:0;font-size:15px;color:var(--display)}
table.rows{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px}
table.rows th{padding:0 12px 8px 0;text-align:left;font-family:var(--mono);font-size:11px;font-weight:400;letter-spacing:.08em;text-transform:uppercase;color:var(--text-2)}
table.rows td{padding:10px 12px 10px 0;vertical-align:top;border-top:1px solid var(--border);overflow-wrap:anywhere}
table.rows td:last-child,table.rows th:last-child{padding-right:0}
table.rows td.attr{position:relative;padding-left:16px}
td.unit{font-family:var(--mono);font-size:12px;color:var(--text-2)}
td.rule code{display:block}td.rule code.path{margin-top:2px;font-size:11px;color:var(--text-2)}
table.rows:not(:has(tbody)){margin-bottom:0}
.attr .n{display:block;color:var(--text)}.attr code{display:block;margin-top:2px;font-size:11px;color:var(--text-2)}
.dot{position:absolute;left:0;top:17px;width:6px;height:6px;border-radius:999px}
.dot.ok{background:var(--success)}.dot.bad{background:var(--accent)}.dot.part{background:var(--warning)}.dot.none{border:1px solid var(--text-disabled)}
.val{font-family:var(--mono);font-size:13px;color:var(--display)}
.kv{display:grid;grid-template-columns:fit-content(50%) minmax(0,1fr);gap:2px 12px}
.kv dt{font-size:11px;line-height:19px;color:var(--text-2)}.kv dd{min-width:0}
.tag-bad{color:var(--accent)}.tag-warn{color:var(--warning)}.tag-ok{color:var(--text)}
.refs{font-family:var(--mono);font-size:11px;color:var(--text-2)}
.msg small{display:block;margin-top:4px;color:var(--text-2)}
col.w-attr{width:38%}col.w-val{width:36%}col.w-unit{width:10%}col.w-status{width:16%}
col.w-sev{width:14%}col.w-rule{width:30%}col.w-msg{width:56%}
col.w-gattr{width:32%}col.w-bucket{width:13%}col.w-legal{width:22%}col.w-action{width:33%}
footer{display:flex;flex-direction:column;gap:8px;margin-top:48px;padding-top:16px;border-top:1px solid var(--border-visible)}
@media (max-width:720px){
.bar{padding:0 16px}.sheet{padding:24px 16px 48px}
.head{flex-direction:column;gap:24px}.head h1{font-size:26px}.qr{align-items:flex-start}
.meta{grid-template-columns:minmax(0,1fr);gap:2px}.meta dd{margin-bottom:10px}
.summary{grid-template-columns:minmax(0,1fr)}.cell,.cell+.cell{padding:16px 0;border-left:0}.cell+.cell{border-top:1px solid var(--border)}
table.rows,table.rows tbody,table.rows tr,table.rows td{display:block;width:auto}
table.rows thead,table.rows colgroup{display:none}
table.rows tr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;padding:10px 0;border-top:1px solid var(--border)}
table.rows td{padding:0;border:0}
table.rows td.attr{padding-left:16px}
table.rows td.attr,table.rows td.wide{grid-column:1/-1}
.dot{top:7px}
}
@media print{:root{color-scheme:light;${LIGHT};--page:#fff}
html{font-size:12px}.bar{position:static;height:auto;padding:0 0 8px}.toggle{display:none}.sheet{max-width:none;padding:16px 0 0}
details.group>summary::after{display:none}details.group>summary:hover{background:none}
table.rows tr,.cell,.head{break-inside:avoid}.section{break-after:avoid}
}
`;
