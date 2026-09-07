/** Inline stylesheet of the passport sheet. No external resource, print-friendly. */
export const SHEET_CSS = `
:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.45;color:#111;background:#fff}
body{margin:0;padding:24px;max-width:960px;margin-inline:auto}
h1{font-size:1.6rem;margin:0 0 .25rem}h2{font-size:1.15rem;margin:1.6rem 0 .5rem;border-bottom:1px solid #ddd;padding-bottom:.2rem}
table{border-collapse:collapse;width:100%;margin:.4rem 0}th,td{text-align:left;vertical-align:top;padding:.3rem .5rem;border-bottom:1px solid #eee}th{font-weight:600;background:#f6f6f6}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em}
.head{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}.head .qr{flex:0 0 auto}.head .qr svg{width:160px;height:160px}
.meta dt{font-weight:600}.meta dd{margin:0 0 .4rem}
.verdict{display:inline-block;padding:.15rem .6rem;border-radius:4px;font-weight:600}
.verdict.valid{background:#e3f6e8;color:#0a5d2a}.verdict.valid_with_warnings{background:#fff4d6;color:#7a5200}.verdict.invalid{background:#fde4e4;color:#8f1b1b}
.sev-error{color:#8f1b1b;font-weight:600}.sev-warning{color:#7a5200;font-weight:600}
.toggle{display:flex;gap:.5rem;justify-content:flex-end;margin-bottom:.5rem}.toggle label{cursor:pointer;padding:.15rem .6rem;border:1px solid #ccc;border-radius:4px}
input[name=lang]{position:absolute;opacity:0;pointer-events:none}
#lang-de:checked~.toggle label[for=lang-de],#lang-en:checked~.toggle label[for=lang-en]{background:#111;color:#fff;border-color:#111}
#lang-de:checked~.sheet [lang=en]{display:none}#lang-en:checked~.sheet [lang=de]{display:none}
ul.nested{margin:0;padding-left:1rem}
footer{margin-top:2rem;font-size:.85rem;color:#555;border-top:1px solid #ddd;padding-top:.6rem}
@media print{.toggle{display:none}body{padding:0}}
`;
