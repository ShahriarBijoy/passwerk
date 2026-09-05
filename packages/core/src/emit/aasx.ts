import { strFromU8, strToU8, unzipSync, type ZipOptions, type Zippable, zipSync } from 'fflate';
import { assembleReport, type ValidateOptions } from '../validate/index.js';
import { validateSchema } from '../validate/schema.js';
import { type EmitResult, PassportDraftError } from './aasJson.js';
import { canonicalJson } from './canonical.js';
import { buildEnvironment, environmentToJsonable } from './environment.js';

export const AASX_SPEC_PART = 'aasx/passwerk/passwerk.aas.json';

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL_ORIGIN = 'http://admin-shell.io/aasx/relationships/aasx-origin';
const REL_SPEC = 'http://admin-shell.io/aasx/relationships/aas-spec';

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="utf-8"?><Types xmlns="${CT_NS}">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />' +
  '<Default Extension="json" ContentType="application/json" />' +
  '<Override PartName="/aasx/aasx-origin" ContentType="text/plain" />' +
  '</Types>';
const ROOT_RELS =
  `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${REL_NS}">` +
  `<Relationship Type="${REL_ORIGIN}" Target="/aasx/aasx-origin" Id="R1" />` +
  '</Relationships>';
const ORIGIN_RELS =
  `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${REL_NS}">` +
  `<Relationship Type="${REL_SPEC}" Target="/${AASX_SPEC_PART}" Id="R2" />` +
  '</Relationships>';
const ORIGIN = 'Intentionally empty.';

/** Fixed timestamp so the package is byte-stable (ZIP has no "no timestamp" option). */
const FIXED: ZipOptions = { level: 6, mtime: new Date(Date.UTC(1980, 0, 1, 0, 0, 0)) };

/** Build the OPC package around the canonical AAS JSON. Entry order is fixed. */
export function packAasx(aasJson: string): Uint8Array {
  const files: Zippable = {
    '[Content_Types].xml': [strToU8(CONTENT_TYPES), FIXED],
    '_rels/.rels': [strToU8(ROOT_RELS), FIXED],
    'aasx/aasx-origin': [strToU8(ORIGIN), FIXED],
    'aasx/_rels/aasx-origin.rels': [strToU8(ORIGIN_RELS), FIXED],
    [AASX_SPEC_PART]: [strToU8(aasJson), FIXED],
  };
  return zipSync(files, FIXED);
}

/** Read the AAS JSON part back out of a package produced by packAasx. */
export function readAasxEnvironment(bytes: Uint8Array): unknown {
  const entries = unzipSync(bytes);
  const part = entries[AASX_SPEC_PART];
  if (!part) throw new Error(`@passwerk/core: AASX has no ${AASX_SPEC_PART}`);
  return JSON.parse(strFromU8(part));
}

/**
 * AASX with the canonical JSON inside. L2 and L3 run on the environment read back out of the
 * packaged bytes; L1 and L4 come from the draft, through the same `assembleReport` as
 * `validate` (issue #12).
 */
export function emitAasx(input: unknown, options: ValidateOptions = {}): EmitResult<Uint8Array> {
  const l1 = validateSchema(input);
  if (!l1.draft) throw new PassportDraftError(l1.findings);
  const environment = buildEnvironment(l1.draft, options);
  const output = packAasx(canonicalJson(environmentToJsonable(environment)));
  const report = assembleReport({ ...l1, draft: l1.draft }, readAasxEnvironment(output), options);
  return { output, environment, verdict: report.verdict, findings: report.findings, report };
}
