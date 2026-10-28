/**
 * The human-readable passport sheet: one self-contained HTML file, inline CSS, no JavaScript,
 * both languages inside with a CSS-only toggle. Fail-honest like the AAS emitters: the verdict
 * is the full L1 to L4 report on the emitted AAS environment (assembleReport), the gap section
 * is gapReport's. Deterministic: knowledge-base order, no wall clock (the generation time is
 * printed only when asOf is given).
 */
import { attributes, type BatteryCategory, listCapabilities, templates } from '@passwerk/rules';
import { CarrierInputError } from '../carrier/error.js';
import { isHttpsUri } from '../carrier/gs1DigitalLink.js';
import { qrMatrix, renderQrSvg } from '../carrier/qr.js';
import { type GapItem, type GapReport, gapReport } from '../gap/report.js';
import type { AnyFieldValue } from '../model/field.js';
import type { PassportDraft } from '../model/passport.js';
import type { Finding, ValidationReport } from '../validate/finding.js';
import { assembleReport, type ValidateOptions } from '../validate/index.js';
import { validateSchema } from '../validate/schema.js';
import { type EmitResult, PassportDraftError } from './aasJson.js';
import { buildEnvironment, environmentToJsonable } from './environment.js';
import { SHEET_CSS } from './htmlSheet.css.js';

export type SheetLang = 'de' | 'en';
export interface HtmlOptions extends ValidateOptions {
  /** Which language the sheet opens in; both are in the file. Default en. */
  lang?: SheetLang;
}

type LangText = { de: string; en: string };

const T = {
  title: { de: 'Batteriepass', en: 'Battery passport' },
  subtitle: {
    de: 'Lesbare Ansicht des Digitalen Batteriepasses (IDTA 02035). Massgeblich sind die AAS-Dateien.',
    en: 'Human-readable view of the Digital Battery Passport (IDTA 02035). The AAS files are authoritative.',
  },
  identifier: { de: 'Batteriepass-Kennung', en: 'Battery passport identifier' },
  category: { de: 'Batteriekategorie', en: 'Battery category' },
  created: { de: 'Entwurf angelegt', en: 'Draft created' },
  generated: { de: 'Erzeugt', en: 'Generated' },
  qr: { de: 'QR-Code der Kennung', en: 'QR code of the identifier' },
  verdict: { de: 'Prüfergebnis', en: 'Verdict' },
  findings: { de: 'Befunde', en: 'Findings' },
  errors: { de: 'Fehler', en: 'Errors' },
  warnings: { de: 'Warnungen', en: 'Warnings' },
  error: { de: 'Fehler', en: 'Error' },
  warning: { de: 'Warnung', en: 'Warning' },
  passportData: { de: 'Passdaten', en: 'Passport data' },
  rule: { de: 'Regel', en: 'Rule' },
  severity: { de: 'Schwere', en: 'Severity' },
  message: { de: 'Meldung', en: 'Message' },
  legalRef: { de: 'Rechtsgrundlage', en: 'Legal reference' },
  noFindings: { de: 'Keine Befunde.', en: 'No findings.' },
  attribute: { de: 'Attribut', en: 'Attribute' },
  value: { de: 'Wert', en: 'Value' },
  unit: { de: 'Einheit', en: 'Unit' },
  status: { de: 'Status', en: 'Status' },
  otherData: { de: 'Weitere Datenpunkte', en: 'Other data points' },
  gaps: { de: 'Offene Datenpunkte', en: 'Open data points' },
  mandatory: { de: 'Pflichtangaben', en: 'Mandatory data' },
  overall: { de: 'Gesamt', en: 'Overall' },
  owner: { de: 'Wer die Daten typischerweise hat', en: 'Who typically has the data' },
  bucket: { de: 'Einstufung', en: 'Bucket' },
  action: { de: 'Nächster Schritt', en: 'Next step' },
  noGaps: {
    de: 'Keine offenen Pflicht- oder bedingten Datenpunkte.',
    en: 'No open required or conditional data points.',
  },
  notLegal: {
    de: 'Dieses Dokument ist keine Rechtsberatung. Jede rechtliche Aussage stammt aus den zitierten Quellen.',
    en: 'This document is not legal advice. Every legal statement comes from the cited sources.',
  },
  sources: { de: 'Quellen', en: 'Sources' },
  kb: { de: 'Wissensbasis abgerufen am', en: 'Knowledge base retrieved' },
  generator: { de: 'Erzeugt mit passwerk', en: 'Generated with passwerk' },
} satisfies Record<string, LangText>;

const CATEGORY: Record<BatteryCategory, LangText> = {
  EV: { de: 'Elektrofahrzeugbatterie', en: 'Electric vehicle battery' },
  LMT: { de: 'Batterie für leichte Verkehrsmittel', en: 'Light means of transport battery' },
  INDUSTRIAL_GT_2KWH: { de: 'Industriebatterie > 2 kWh', en: 'Industrial battery > 2 kWh' },
};

const VERDICT: Record<ValidationReport['verdict'], LangText> = {
  valid: { de: 'Gültig', en: 'Valid' },
  valid_with_warnings: { de: 'Gültig mit Warnungen', en: 'Valid with warnings' },
  invalid: { de: 'Ungültig', en: 'Invalid' },
};

const FIELD_STATUS: Record<string, LangText> = {
  present: { de: 'vorhanden', en: 'present' },
  conflict: { de: 'Konflikt', en: 'conflict' },
  not_applicable: { de: 'nicht anwendbar', en: 'not applicable' },
  missing: { de: 'fehlt', en: 'missing' },
};

const BUCKET: Record<string, LangText> = {
  required: { de: 'Pflicht', en: 'required' },
  conditional: { de: 'bedingt', en: 'conditional' },
  optional: { de: 'optional', en: 'optional' },
  deferred: { de: 'später', en: 'deferred' },
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Both languages as sibling spans; the CSS toggle hides one. */
const both = (t: LangText): string =>
  `<span lang="de">${escapeHtml(t.de)}</span><span lang="en">${escapeHtml(t.en)}</span>`;

/** A scalar becomes text; a composite becomes one `path › to › leaf` line per leaf, keys sorted. */
function flatten(v: unknown, path: string[], out: [string, string][]): void {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      flatten(x, [...path, `#${i + 1}`], out);
    });
    return;
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    for (const [k, x] of entries) flatten(x, [...path, k], out);
    return;
  }
  out.push([path.join(' › '), String(v)]);
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return escapeHtml(String(v));
  const leaves: [string, string][] = [];
  flatten(v, [], leaves);
  return `<dl class="kv">${leaves
    .map(([p, x]) => `<dt>${escapeHtml(p)}</dt><dd>${escapeHtml(x)}</dd>`)
    .join('')}</dl>`;
}

type DotTone = 'ok' | 'bad' | 'part' | 'none';

/** The dot before an attribute name: green present, red wrong, amber partial, hollow absent. */
const attrCell = (tone: DotTone, name: LangText, id: string): string =>
  `<td class="attr"><span class="dot ${tone}" aria-hidden="true"></span><span class="n">${both(name)}</span><code>${escapeHtml(id)}</code></td>`;

const FIELD_DOT: Record<string, DotTone> = { present: 'ok', conflict: 'bad' };
const GAP_DOT: Record<string, DotTone> = { invalid: 'bad', conflict: 'bad', partial: 'part' };
const GAP_COLS = ['gattr', 'bucket', 'legal', 'action'];

/** Fixed column widths (the `w-*` classes) keep tables aligned across the groups of a section. */
function rowsTable(cols: string[], head: LangText[] | null, rows: string[]): string {
  const colgroup = cols.map((c) => `<col class="w-${c}">`).join('');
  const thead =
    head === null
      ? ''
      : `<thead><tr>${head.map((h) => `<th>${both(h)}</th>`).join('')}</tr></thead>`;
  const tbody = rows.length === 0 ? '' : `<tbody>\n${rows.join('\n')}\n</tbody>`;
  return `<table class="rows"><colgroup>${colgroup}</colgroup>${thead}${tbody}</table>`;
}

/** A foldable section, open by default: a native `<details>`, so no script is needed. */
function group(name: string, meta: string | null, count: number, body: string): string {
  const metaSpan = meta === null ? '' : `<span class="label">${escapeHtml(meta)}</span>`;
  return `<details class="group" open><summary><span class="name">${name}</span>${metaSpan}<span class="label count">${count}</span></summary>${body}</details>`;
}

function attributeRows(draft: PassportDraft, part: number | null): string[] {
  const rows: string[] = [];
  for (const a of attributes) {
    if (a.part !== part) continue;
    const field = (draft.attributes as Record<string, AnyFieldValue | undefined>)[a.id];
    if (!field || field.status === 'missing') continue;
    const unit = field.unit ?? a.unit ?? '';
    const statusText = FIELD_STATUS[field.status] ?? (FIELD_STATUS['missing'] as LangText);
    const tag = field.status === 'conflict' ? 'label tag-bad' : 'label';
    rows.push(
      `<tr>${attrCell(FIELD_DOT[field.status] ?? 'none', a.name, a.id)}<td class="val wide">${renderValue(field.value)}</td><td class="unit">${escapeHtml(unit)}</td><td class="${tag}">${both(statusText)}</td></tr>`,
    );
  }
  return rows;
}

function attributeSections(draft: PassportDraft): string {
  const table = (rows: string[]) =>
    rowsTable(['attr', 'val', 'unit', 'status'], [T.attribute, T.value, T.unit, T.status], rows);
  const out: string[] = [];
  for (const t of templates) {
    const rows = attributeRows(draft, t.part);
    if (rows.length === 0) continue;
    out.push(
      group(escapeHtml(t.submodelIdShort), `${t.idta} · ${t.version}`, rows.length, table(rows)),
    );
  }
  const other = attributeRows(draft, null);
  if (other.length > 0) out.push(group(both(T.otherData), null, other.length, table(other)));
  return `<h2 class="section label">${both(T.passportData)}</h2>\n${out.join('\n')}`;
}

function findingsSection(report: ValidationReport): string {
  if (report.findings.length === 0) return '';
  const rows = report.findings.map((f: Finding) => {
    const legal = f.legalRef ? `<small>${both(T.legalRef)}: ${escapeHtml(f.legalRef)}</small>` : '';
    const tone = f.severity === 'error' ? 'tag-bad' : 'tag-warn';
    const severity = f.severity === 'error' ? T.error : T.warning;
    return `<tr><td class="label ${tone}">${both(severity)} · ${escapeHtml(f.layer)}</td><td class="rule wide"><code>${escapeHtml(f.ruleId)}</code><code class="path">${escapeHtml(f.path)}</code></td><td class="msg wide">${both(f.message)}${legal}</td></tr>`;
  });
  const table = rowsTable(['sev', 'rule', 'msg'], [T.severity, T.rule, T.message], rows);
  return group(both(T.findings), null, rows.length, table);
}

function gapSection(gap: GapReport): string {
  const open = (i: GapItem) =>
    (i.bucket === 'required' || i.bucket === 'conditional') &&
    (i.status === 'missing' ||
      i.status === 'partial' ||
      i.status === 'invalid' ||
      i.status === 'conflict');
  const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
  const groups: string[] = [];
  let total = 0;
  for (const g of gap.byDataOwner) {
    const items = g.attributeIds
      .map((id) => byId.get(id))
      .filter((i): i is GapItem => !!i && open(i));
    if (items.length === 0) continue;
    total += items.length;
    const rows = items.map((i) => {
      const bucketText = BUCKET[i.bucket] ?? (BUCKET['optional'] as LangText);
      return `<tr>${attrCell(GAP_DOT[i.status] ?? 'none', i.name, i.attributeId)}<td class="label">${both(bucketText)}</td><td class="refs">${i.legalRefs.map(escapeHtml).join('<br>')}</td><td class="note wide">${both(i.suggestedAction)}</td></tr>`;
    });
    groups.push(group(both(g.owner), null, items.length, rowsTable(GAP_COLS, null, rows)));
  }
  const heading = `<h2 class="section label"><span>${both(T.gaps)}</span><span>${total}</span></h2>`;
  if (groups.length === 0) return `${heading}\n<p class="note">${both(T.noGaps)}</p>`;
  // One owner usually holds one or two values, so the column heads are said once, not per group.
  const head = rowsTable(GAP_COLS, [T.attribute, T.bucket, T.legalRef, T.action], []);
  return `${heading}\n${head}\n${groups.join('\n')}`;
}

/** 36 discrete blocks like the workbench's SegmentedBar; the number beside it is the precision. */
function segmentedBar(present: number, total: number): string {
  const segments = 36;
  const on = total > 0 ? Math.floor((Math.min(present, total) / total) * segments) : 0;
  const cells = Array.from({ length: segments }, (_, i) =>
    i < on ? '<i class="on"></i>' : '<i></i>',
  );
  return `<div class="seg" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${present}">${cells.join('')}</div>`;
}

function summarySection(report: ValidationReport, gap: GapReport): string {
  const verdict = VERDICT[report.verdict];
  const long = /\s/.test(verdict.de) || /\s/.test(verdict.en) ? ' long' : '';
  const errors = report.findings.filter((f) => f.severity === 'error').length;
  const warnings = report.findings.length - errors;
  const tally =
    report.findings.length === 0
      ? `<p class="note">${both(T.noFindings)}</p>`
      : `<p class="tally">${errors > 0 ? `<span class="label tag-bad">${both(T.errors)} ${errors}</span>` : ''}${warnings > 0 ? `<span class="label tag-warn">${both(T.warnings)} ${warnings}</span>` : ''}</p>`;
  const meter = (label: LangText, c: GapReport['completeness']['mandatory']) =>
    `<div class="cell"><p class="label">${both(label)}</p><p class="hero"><span class="display">${escapeHtml(String(c.percent))}</span><span class="unit">%</span></p>${segmentedBar(c.present, c.total)}<p class="label">${c.present} / ${c.total}</p></div>`;
  return `<section class="summary">
<div class="cell" data-verdict="${report.verdict}"><p class="label">${both(T.verdict)}</p><p class="hero"><span class="display${long}">${both(verdict)}</span></p>${tally}</div>
${meter(T.mandatory, gap.completeness.mandatory)}
${meter(T.overall, gap.completeness.overall)}
</section>`;
}

function renderSheet(
  draft: PassportDraft,
  report: ValidationReport,
  gap: GapReport,
  options: HtmlOptions,
): string {
  const lang = options.lang ?? 'en';
  const uid = draft.meta.passportId;
  let qr: string;
  try {
    qr = renderQrSvg(qrMatrix(uid)).trim();
  } catch (error) {
    if (!(error instanceof CarrierInputError)) throw error;
    qr = `<p>${both(error.text)}</p>`;
  }
  const identifier = `<code>${escapeHtml(uid)}</code>`;
  const identifierLink = isHttpsUri(uid)
    ? `<a href="${escapeHtml(uid)}">${identifier}</a>`
    : identifier;
  const caps = listCapabilities();
  const generated =
    options.asOf !== undefined
      ? `<dt>${both(T.generated)}</dt><dd><code>${escapeHtml(options.asOf)}</code></dd>\n`
      : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(lang === 'de' ? T.title.de : T.title.en)}: ${escapeHtml(uid)}</title>
<style>${SHEET_CSS}</style>
</head>
<body>
<input type="radio" name="lang" id="lang-de"${lang === 'de' ? ' checked' : ''}>
<input type="radio" name="lang" id="lang-en"${lang === 'en' ? ' checked' : ''}>
<header class="bar"><span class="label">passwerk</span><nav class="toggle label"><label for="lang-de">Deutsch</label><label for="lang-en">English</label></nav></header>
<main class="sheet">
<header class="head">
<div>
<p class="label">${both(T.title)} · IDTA 02035</p>
<h1>${both(CATEGORY[draft.meta.category])}</h1>
<dl class="meta">
<dt>${both(T.identifier)}</dt><dd>${identifierLink}</dd>
<dt>${both(T.category)}</dt><dd><code>${escapeHtml(draft.meta.category)}</code></dd>
<dt>${both(T.created)}</dt><dd><code>${escapeHtml(draft.meta.createdAt)}</code></dd>
${generated}</dl>
</div>
<figure class="qr">${qr}<figcaption class="label">${both(T.qr)}</figcaption></figure>
</header>
${summarySection(report, gap)}
<p class="note lede">${both(T.subtitle)}</p>
${findingsSection(report)}
${attributeSections(draft)}
${gapSection(gap)}
<footer>
<p class="note">${both(T.notLegal)}</p>
<p class="note">${both(T.sources)}: ${gap.sources.map(escapeHtml).join('; ')}</p>
<p class="label">${both(T.kb)} ${escapeHtml(caps.artefactsRetrievedAt)} · ${both(T.generator)}</p>
</footer>
</main>
</body>
</html>
`;
}

export function emitHtml(input: unknown, options: HtmlOptions = {}): EmitResult<string> {
  const l1 = validateSchema(input);
  if (!l1.draft) throw new PassportDraftError(l1.findings);
  const environment = buildEnvironment(l1.draft, options);
  const jsonable = environmentToJsonable(environment);
  const report = assembleReport({ ...l1, draft: l1.draft }, jsonable, options);
  const gap = gapReport(l1.draft, {
    report,
    ...(options.asOf !== undefined ? { asOf: options.asOf } : {}),
  });
  return {
    output: renderSheet(l1.draft, report, gap, options),
    environment,
    verdict: report.verdict,
    findings: report.findings,
    report,
  };
}
