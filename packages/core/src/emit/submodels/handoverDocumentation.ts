import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { attributes, getAttribute } from '@passwerk/rules';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import type { DocumentRef } from '../../model/values.js';
import { collection, file, list, multiLanguageProperty, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { push, submodelFromTemplate } from './shared.js';

const D = '2/Documents/Document';
const C = `${D}/DocumentClassifications/DocumentClassification`;
const I = `${D}/DocumentIds/DocumentId`;
const V = `${D}/DocumentVersions/DocumentVersion`;

/** Every KB attribute with valueKind 'document', in KB order. */
export const DOCUMENT_ATTRIBUTES: readonly string[] = attributes
  .filter((a) => a.valueKind === 'document')
  .map((a) => a.id);

function documentElement(
  draft: PassportDraft,
  attributeId: string,
  ref: DocumentRef,
): aas.types.SubmodelElementCollection {
  const cls = ref.classification as NonNullable<DocumentRef['classification']>;
  const languages = ref.languages ?? ['en'];
  const titleLang = languages[0] as string;
  const kbName = getAttribute(attributeId)?.name;
  const title = ref.title
    ? { [titleLang]: ref.title }
    : { de: kbName?.de ?? attributeId, en: kbName?.en ?? attributeId };

  const version: aas.types.ISubmodelElement[] = [
    list(
      `${V}/Language`,
      languages.map((l) => property(`${V}/Language/[0]`, l)),
    ),
  ];
  if (ref.version) push(version, property(`${V}/Version`, ref.version));
  push(version, multiLanguageProperty(`${V}/Title`, title));
  const target = ref.uri ?? ref.fileName;
  if (target) {
    push(
      version,
      list(`${V}/DigitalFiles`, [
        file(`${V}/DigitalFiles/[0]`, ref.contentType ?? 'application/octet-stream', target),
      ]),
    );
  }

  return collection(D, [
    list(`${D}/DocumentClassifications`, [
      collection(C, [
        multiLanguageProperty(`${C}/ClassName`, cls.className),
        property(`${C}/ClassId`, cls.classId),
        property(`${C}/ClassificationSystem`, cls.system),
      ]),
    ]),
    list(`${D}/DocumentIds`, [
      collection(I, [
        property(`${I}/DocumentDomainId`, ref.domainId ?? draft.meta.passportId),
        property(`${I}/DocumentIdentifier`, ref.id),
        property(`${I}/DocumentIsPrimary`, 'true'),
      ]),
    ]),
    list(`${D}/DocumentVersions`, [collection(V, version)]),
  ]);
}

/**
 * IDTA 02035-2 Handover Documentation, built from every classified DocumentRef across the KB's
 * document-kind attributes (ADR D-017). A DocumentRef without a classification is left out
 * here; PW-L1-DOCUMENT-UNCLASSIFIED reports the gap. Returns null when no document is classified.
 */
export function emitHandoverDocumentation(
  draft: PassportDraft,
  ids: EmitIds,
): aas.types.Submodel | null {
  const docs: aas.types.ISubmodelElement[] = [];
  for (const id of DOCUMENT_ATTRIBUTES) {
    const refs = presentValue<DocumentRef[]>(draft, id);
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) if (ref?.classification) docs.push(documentElement(draft, id, ref));
  }
  if (docs.length === 0) return null;
  return submodelFromTemplate(2, ids.submodelId('HandoverDocumentation'), [
    list('2/Documents', docs),
  ]);
}
