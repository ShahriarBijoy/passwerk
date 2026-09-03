import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { ManufacturerInformation } from '../../model/composites.js';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import type { DocumentRef, GraphicRef } from '../../model/values.js';
import {
  collection,
  file,
  list,
  multiLanguageProperty,
  plainProperty,
  property,
} from '../elements.js';
import type { EmitIds } from '../ids.js';
import { hasAny, push, submodelFromTemplate } from './shared.js';

const P = '1';
const M = `${P}/Markings/Markings__00__`;

/**
 * Marking names are the context names quoted in the IDTA 02035-1 template description of
 * MarkingName (DIN DKE SPEC 99100 6.2.2, 6.2.3, 6.2.6).
 */
const MARKINGS: { attributeId: string; name: string }[] = [
  { attributeId: 'separateCollectionSymbol', name: 'Separate collection symbol' },
  { attributeId: 'cadmiumLeadSymbols', name: 'Symbols for cadmium and lead' },
  { attributeId: 'meaningOfLabelsAndSymbols', name: 'Meaning of labels and symbols' },
];

export const NAMEPLATE_ATTRIBUTES: readonly string[] = [
  'batteryPassportIdentifier',
  'manufacturerInformation',
  'batteryIdentifier',
  'manufacturingDate',
  'dateOfPuttingIntoService',
  'manufacturingPlace',
  'batteryStatus',
  'operatorIdentifier',
  'separateCollectionSymbol',
  'cadmiumLeadSymbols',
  'meaningOfLabelsAndSymbols',
  'euDeclarationOfConformity',
  'testReportsProvingCompliance',
];

function address(
  info: ManufacturerInformation['address'],
): aas.types.SubmodelElementCollection | null {
  if (!info) return null;
  const children: aas.types.ISubmodelElement[] = [];
  // idShorts follow the ZVEI Contact Information template; semanticIds are not bundled (verify).
  const pairs: [string, string | undefined][] = [
    ['Street', info.street],
    ['Zipcode', info.zipCode],
    ['CityTown', info.cityTown],
    ['NationalCode', info.nationalCode],
    ['Email', info.email],
    ['Phone', info.phone],
    ['Website', info.website],
  ];
  for (const [idShort, value] of pairs) if (value) children.push(plainProperty(idShort, value));
  return collection(`${P}/AddressInformation`, children);
}

function marking(
  name: string,
  graphic: GraphicRef | undefined,
  text: string | undefined,
): aas.types.SubmodelElementCollection {
  const children: aas.types.ISubmodelElement[] = [property(`${M}/MarkingName`, name)];
  if (graphic) {
    push(children, file(`${M}/MarkingFile`, graphic.contentType, graphic.uri ?? graphic.fileName));
  }
  const extra = graphic?.additionalText ?? text;
  if (extra) push(children, property(`${M}/MarkingAdditionalText`, extra));
  return collection(M, children);
}

function documentList(
  path: string,
  docs: DocumentRef[] | undefined,
): aas.types.SubmodelElementList | null {
  if (!docs || docs.length === 0) return null;
  return list(
    path,
    docs.map((d) => property(`${path}/DocumentIdentifier`, d.id)),
  );
}

/** IDTA 02035-1 Battery Nameplate. Returns null when the draft has no nameplate data. */
export function emitNameplate(draft: PassportDraft, ids: EmitIds): aas.types.Submodel | null {
  if (!hasAny(draft, NAMEPLATE_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const els: aas.types.ISubmodelElement[] = [];
  const manufacturer = v<ManufacturerInformation>('manufacturerInformation');

  // Catalogue order for part 1.
  push(els, property(`${P}/URIOfTheProduct`, draft.meta.passportId));
  if (manufacturer) push(els, multiLanguageProperty(`${P}/ManufacturerName`, manufacturer.name));
  if (manufacturer) push(els, address(manufacturer.address));
  const serial = v<string>('batteryIdentifier');
  if (serial) push(els, property(`${P}/SerialNumber`, serial));
  const made = v<string>('manufacturingDate');
  if (made) push(els, property(`${P}/DateOfManufacture`, made));
  const inService = v<string>('dateOfPuttingIntoService');
  if (inService) push(els, property(`${P}/DateOfPuttingIntoService`, inService));
  const facility = v<string>('manufacturingPlace');
  if (facility) push(els, property(`${P}/UniqueFacilityIdentifier`, facility));
  const stage = v<string>('batteryStatus');
  if (stage) push(els, property(`${P}/LifeCycleStage`, stage));
  const operator = v<string>('operatorIdentifier');
  if (operator) push(els, property(`${P}/OperatorIdentifier`, operator));
  if (manufacturer) push(els, property(`${P}/ManufacturerIdentifier`, manufacturer.identifier));

  const markings: aas.types.ISubmodelElement[] = [];
  for (const { attributeId, name } of MARKINGS) {
    const value = v<GraphicRef | string>(attributeId);
    if (value === undefined) continue;
    markings.push(
      typeof value === 'string' ? marking(name, undefined, value) : marking(name, value, undefined),
    );
  }
  if (markings.length > 0) push(els, list(`${P}/Markings`, markings));

  push(
    els,
    documentList(`${P}/EUDeclarationOfConformity`, v<DocumentRef[]>('euDeclarationOfConformity')),
  );
  push(
    els,
    documentList(
      `${P}/ResultsOfTestReportsProvingCompliance`,
      v<DocumentRef[]>('testReportsProvingCompliance'),
    ),
  );

  return submodelFromTemplate(1, ids.submodelId('BatteryNameplate'), els);
}
