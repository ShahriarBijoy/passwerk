/**
 * The human-readable passport sheet: one self-contained HTML file, inline CSS, no JavaScript,
 * both languages inside with a CSS-only toggle. Fail-honest like the AAS emitters: the verdict
 * is the full L1 to L4 report on the emitted AAS environment (assembleReport), the gap section
 * is gapReport's. Deterministic: knowledge-base order, no wall clock (the generation time is
 * printed only when asOf is given).
 */
import { attributes, type BatteryCategory, listCapabilities, templates } from '@passwerk/rules';
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
  layer: { de: 'Ebene', en: 'Layer' },
  rule: { de: 'Regel', en: 'Rule' },
  severity: { de: 'Schwere', en: 'Severity' },
  path: { de: 'Pfad', en: 'Path' },
  message: { de: 'Meldung', en: 'Message' },
  legalRef: { de: 'Rechtsgrundlage', en: 'Legal reference' },
  noFindings: { de: 'Keine Befunde.', en: 'No findings.' },
  attribute: { de: 'Attribut', en: 'Attribute' },
  value: { de: 'Wert', en: 'Value' },
  unit: { de: 'Einheit', en: 'Unit' },
  status: { de: 'Status', en: 'Status' },
  otherData: { de: 'Weitere Datenpunkte', en: 'Other data points' },
  gaps: { de: 'Offene Datenpunkte', en: 'Open data points' },
  completeness: { de: 'Vollständigkeit', en: 'Completeness' },
  mandatory: { de: 'Pflicht', en: 'mandatory' },
  overall: { de: 'gesamt', en: 'overall' },
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

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    return `<ul class="nested">${v.map((x) => `<li>${renderValue(x)}</li>`).join('')}</ul>`;
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `<ul class="nested">${entries
      .map(([k, x]) => `<li><code>${escapeHtml(k)}</code>: ${renderValue(x)}</li>`)
      .join('')}</ul>`;
  }
  return escapeHtml(String(v));
}

function attributeRows(draft: PassportDraft, part: number | null): string {
  const rows: string[] = [];
  for (const a of attributes) {
    if (a.part !== part) continue;
    const field = (draft.attributes as Record<string, AnyFieldValue | undefined>)[a.id];
    if (!field || field.status === 'missing') continue;
    const unit = field.unit ?? a.unit ?? '';
    const statusText = FIELD_STATUS[field.status] ?? (FIELD_STATUS['missing'] as LangText);
    rows.push(
      `<tr><td>${both(a.name)}<br><code>${escapeHtml(a.id)}</code></td><td>${renderValue(field.value)}</td><td>${escapeHtml(unit)}</td><td>${both(statusText)}</td></tr>`,
    );
  }
  return rows.join('\n');
}

function attributeSections(draft: PassportDraft): string {
  const out: string[] = [];
  const header = `<tr><th>${both(T.attribute)}</th><th>${both(T.value)}</th><th>${both(T.unit)}</th><th>${both(T.status)}</th></tr>`;
  for (const t of templates) {
    const rows = attributeRows(draft, t.part);
    if (rows === '') continue;
    out.push(
      `<h2>${escapeHtml(`IDTA ${t.idta} ${t.version}: ${t.submodelIdShort}`)}</h2><table>${header}${rows}</table>`,
    );
  }
  const other = attributeRows(draft, null);
  if (other !== '') out.push(`<h2>${both(T.otherData)}</h2><table>${header}${other}</table>`);
  return out.join('\n');
}

function findingsSection(report: ValidationReport): string {
  const badge = `<span class="verdict ${report.verdict}">${escapeHtml(report.verdict)}</span>`;
  if (report.findings.length === 0) {
    return `<h2>${both(T.verdict)}</h2><p>${badge} ${both(T.noFindings)}</p>`;
  }
  const rows = report.findings
    .map((f: Finding) => {
      const legal = f.legalRef
        ? `<br><small>${both(T.legalRef)}: ${escapeHtml(f.legalRef)}</small>`
        : '';
      return `<tr><td>${escapeHtml(f.layer)}</td><td><code>${escapeHtml(f.ruleId)}</code></td><td class="sev-${f.severity}">${escapeHtml(f.severity)}</td><td><code>${escapeHtml(f.path)}</code></td><td>${both(f.message)}${legal}</td></tr>`;
    })
    .join('\n');
  return `<h2>${both(T.verdict)}</h2><p>${badge}</p><table><tr><th>${both(T.layer)}</th><th>${both(T.rule)}</th><th>${both(T.severity)}</th><th>${both(T.path)}</th><th>${both(T.message)}</th></tr>${rows}</table>`;
}

function gapSection(gap: GapReport): string {
  const open = (i: GapItem) =>
    (i.bucket === 'required' || i.bucket === 'conditional') &&
    (i.status === 'missing' || i.status === 'invalid' || i.status === 'conflict');
  const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
  const completeness = `<p>${both(T.completeness)}: ${both(T.mandatory)} ${gap.completeness.mandatory.present}/${gap.completeness.mandatory.total} (${gap.completeness.mandatory.percent} %), ${both(T.overall)} ${gap.completeness.overall.present}/${gap.completeness.overall.total} (${gap.completeness.overall.percent} %)</p>`;
  const groups: string[] = [];
  for (const g of gap.byDataOwner) {
    const items = g.attributeIds
      .map((id) => byId.get(id))
      .filter((i): i is GapItem => !!i && open(i));
    if (items.length === 0) continue;
    const rows = items
      .map((i) => {
        const bucketText = BUCKET[i.bucket] ?? (BUCKET['optional'] as LangText);
        return `<tr><td>${both(i.name)}<br><code>${escapeHtml(i.attributeId)}</code></td><td>${both(bucketText)}</td><td>${i.legalRefs.map(escapeHtml).join('<br>')}</td><td>${both(i.suggestedAction)}</td></tr>`;
      })
      .join('\n');
    groups.push(
      `<h3>${both(g.owner)}</h3><table><tr><th>${both(T.attribute)}</th><th>${both(T.bucket)}</th><th>${both(T.legalRef)}</th><th>${both(T.action)}</th></tr>${rows}</table>`,
    );
  }
  return `<h2>${both(T.gaps)}</h2>${completeness}${groups.length === 0 ? `<p>${both(T.noGaps)}</p>` : groups.join('\n')}`;
}

function renderSheet(
  draft: PassportDraft,
  report: ValidationReport,
  gap: GapReport,
  options: HtmlOptions,
): string {
  const lang = options.lang ?? 'en';
  const uid = draft.meta.passportId;
  const qr = renderQrSvg(qrMatrix(uid)).trim();
  const caps = listCapabilities();
  const generated =
    options.asOf !== undefined
      ? `<dt>${both(T.generated)}</dt><dd>${escapeHtml(options.asOf)}</dd>`
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
<nav class="toggle"><label for="lang-de">Deutsch</label><label for="lang-en">English</label></nav>
<main class="sheet">
<header class="head">
<div>
<h1>${both(T.title)}</h1>
<p>${both(T.subtitle)}</p>
<dl class="meta">
<dt>${both(T.identifier)}</dt><dd><a href="${escapeHtml(uid)}"><code>${escapeHtml(uid)}</code></a></dd>
<dt>${both(T.category)}</dt><dd>${both(CATEGORY[draft.meta.category])} (<code>${escapeHtml(draft.meta.category)}</code>)</dd>
<dt>${both(T.created)}</dt><dd>${escapeHtml(draft.meta.createdAt)}</dd>
${generated}
</dl>
</div>
<figure class="qr"><figcaption>${both(T.qr)}</figcaption>${qr}</figure>
</header>
${findingsSection(report)}
${attributeSections(draft)}
${gapSection(gap)}
<footer>
<p>${both(T.notLegal)}</p>
<p>${both(T.sources)}: ${gap.sources.map(escapeHtml).join('; ')}</p>
<p>${both(T.kb)} ${escapeHtml(caps.artefactsRetrievedAt)}. ${both(T.generator)}.</p>
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
