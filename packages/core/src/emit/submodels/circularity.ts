import type { SparePartComponent, SparePartSupplier } from '../../model/composites.js';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import type * as aas from '../../vendor/aasCore.js';
import { collection, list, multiLanguageProperty, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { documentIds, hasAny, submodelFromTemplate } from './shared.js';

const P = '7';
const SUPPLIER = `${P}/SparePartSources/SparePartSupplier`;
const RC = `${P}/RecycledContentInformation/RecycledContent`;
const SAFETY = `${P}/SafetyMeasures`;
const EOL = `${P}/EndOfLifeInformation`;

/** The Article 8 recycled-content materials, with their pre- and post-consumer share attributes. */
const RECYCLED: readonly { material: string; pre: string; post: string }[] = [
  { material: 'Cobalt', pre: 'recycledCobaltPreConsumer', post: 'recycledCobaltPostConsumer' },
  { material: 'Lithium', pre: 'recycledLithiumPreConsumer', post: 'recycledLithiumPostConsumer' },
  { material: 'Nickel', pre: 'recycledNickelPreConsumer', post: 'recycledNickelPostConsumer' },
  { material: 'Lead', pre: 'recycledLeadPreConsumer', post: 'recycledLeadPostConsumer' },
];
const EOL_LISTS: readonly { id: string; idShort: string }[] = [
  { id: 'endUserInfoWastePrevention', idShort: 'WastePrevention' },
  { id: 'endUserInfoSeparateCollection', idShort: 'SeparateCollection' },
  { id: 'endUserInfoCollectionAndTreatment', idShort: 'InformationOnCollection' },
];

export const CIRCULARITY_ATTRIBUTES: readonly string[] = [
  'dismantlingInformation',
  'sparePartSources',
  'componentPartNumbers',
  ...RECYCLED.flatMap((r) => [r.pre, r.post]),
  'safetyMeasures',
  'extinguishingAgent',
  ...EOL_LISTS.map((l) => l.id),
  'renewableContentShare',
];

/** Loose input shapes: the emitter must tolerate drafts that failed L1 (fail-honest emit). */
type SupplierIn = Partial<SparePartSupplier>;
type ComponentIn = Partial<SparePartComponent>;
type Docs = { id: string; uri?: string }[];

function components(items: readonly ComponentIn[]): aas.types.SubmodelElementList {
  const COMP = `${SUPPLIER}/Components/Component`;
  return list(
    `${SUPPLIER}/Components`,
    items.map((c) => {
      const el: aas.types.ISubmodelElement[] = [];
      if (c.partName) el.push(property(`${COMP}/PartName`, c.partName));
      if (c.partNumber) el.push(property(`${COMP}/PartNumber`, c.partNumber));
      return collection(COMP, el);
    }),
  );
}

function supplier(s: SupplierIn, fallback: ComponentIn[]): aas.types.SubmodelElementCollection {
  const el: aas.types.ISubmodelElement[] = [];
  const name = s.name ?? {};
  const lang = Object.keys(name).sort()[0] ?? 'en';
  if (Object.keys(name).length > 0)
    el.push(multiLanguageProperty(`${SUPPLIER}/NameOfSupplier`, name));
  if (s.address) {
    const ADDR = `${SUPPLIER}/AddressOfSupplier`;
    const a: aas.types.ISubmodelElement[] = [];
    // The template types these as MultiLanguageProperty; we use the supplier name's language.
    if (s.address.nationalCode) {
      a.push(multiLanguageProperty(`${ADDR}/NationalCode`, { [lang]: s.address.nationalCode }));
    }
    if (s.address.postalCode) {
      a.push(multiLanguageProperty(`${ADDR}/PostalCode`, { [lang]: s.address.postalCode }));
    }
    if (s.address.street) {
      a.push(multiLanguageProperty(`${ADDR}/Street`, { [lang]: s.address.street }));
    }
    el.push(collection(ADDR, a));
  }
  if (s.email) {
    const MAIL = `${SUPPLIER}/EmailAddressOfSupplier`;
    el.push(collection(MAIL, [property(`${MAIL}/EmailAddress`, s.email)]));
  }
  if (s.website) el.push(property(`${SUPPLIER}/SupplierWebAddress`, s.website));
  const comps = s.components && s.components.length > 0 ? s.components : fallback;
  if (comps.length > 0) el.push(components(comps));
  return collection(SUPPLIER, el);
}

/**
 * IDTA 02035-7 Circularity. SparePartSources is a structural list (One, items ZeroToMany) and
 * is always emitted; RecycledContentInformation folds the eight share attributes into one
 * entry per Article 8 material (ADR D-015).
 */
export function emitCircularity(draft: PassportDraft, ids: EmitIds): aas.types.Submodel | null {
  if (!hasAny(draft, CIRCULARITY_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const els: aas.types.ISubmodelElement[] = [];

  const dismantling = v<Docs>('dismantlingInformation');
  if (dismantling) els.push(documentIds(`${P}/DismantlingAndRemovalInformation`, dismantling));

  const fallbackComponents = v<ComponentIn[]>('componentPartNumbers') ?? [];
  const suppliers = v<SupplierIn[]>('sparePartSources') ?? [];
  els.push(
    list(
      `${P}/SparePartSources`,
      suppliers.map((s) => supplier(s, fallbackComponents)),
    ),
  );

  const recycled = RECYCLED.filter(
    (r) => v<string>(r.pre) !== undefined || v<string>(r.post) !== undefined,
  ).map((r) => {
    const el: aas.types.ISubmodelElement[] = [];
    const pre = v<string>(r.pre);
    const post = v<string>(r.post);
    if (pre !== undefined) el.push(property(`${RC}/PreConsumerShare`, pre));
    el.push(property(`${RC}/RecycledMaterial`, r.material));
    if (post !== undefined) el.push(property(`${RC}/PostConsumerShare`, post));
    return collection(RC, el);
  });
  if (recycled.length > 0) els.push(list(`${P}/RecycledContentInformation`, recycled));

  const safetyDocs = v<Docs>('safetyMeasures');
  const agent = v<string>('extinguishingAgent');
  if (safetyDocs || agent !== undefined) {
    const s: aas.types.ISubmodelElement[] = [];
    if (safetyDocs) s.push(documentIds(`${SAFETY}/SafetyInstructions`, safetyDocs));
    if (agent !== undefined) {
      s.push(
        list(`${SAFETY}/ExtinguishingAgents`, [
          property(`${SAFETY}/ExtinguishingAgents/ExtinguishingAgent`, agent),
        ]),
      );
    }
    els.push(collection(SAFETY, s));
  }

  const eol = EOL_LISTS.filter((l) => v<Docs>(l.id) !== undefined).map((l) =>
    documentIds(`${EOL}/${l.idShort}`, v<Docs>(l.id) as Docs),
  );
  if (eol.length > 0) els.push(collection(EOL, eol));

  const renewable = v<string>('renewableContentShare');
  if (renewable !== undefined) els.push(property(`${P}/RenewableContent`, renewable));

  return submodelFromTemplate(7, ids.submodelId('Circularity'), els);
}
