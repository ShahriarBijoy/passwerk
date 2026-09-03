import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { getAttribute } from '@passwerk/rules';
import type { CarbonFootprintGeneralInformation } from '../../model/composites.js';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import { collection, list, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { hasAny, submodelFromTemplate } from './shared.js';

const P = '3';
const PCF = `${P}/ProductCarbonFootprints/ProductCarbonFootprint`;

const SHARE_ATTRIBUTES = [
  'carbonFootprintShareRawMaterials',
  'carbonFootprintShareManufacturing',
  'carbonFootprintShareDistribution',
  'carbonFootprintShareEndOfLife',
] as const;

export const CARBON_ATTRIBUTES: readonly string[] = [
  'carbonFootprintGeneralInformation',
  'carbonFootprintPerFunctionalUnit',
  ...SHARE_ATTRIBUTES,
  'carbonFootprintPerformanceClass',
  'carbonFootprintStudyLink',
];

/**
 * IDTA 02035-3 Carbon Footprint (one ProductCarbonFootprint per passport).
 *
 * The four life-cycle share attributes (percentages, KB marks them `verify`) cannot be carried
 * as numbers in the template's LifeCyclePhases list of xs:string phase names. We emit the phase
 * name (the KB attribute's English name) for every share that is present; the percentages stay
 * in the draft for the gap report and the HTML sheet.
 */
export function emitCarbonFootprint(draft: PassportDraft, ids: EmitIds): aas.types.Submodel | null {
  if (!hasAny(draft, CARBON_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const c: aas.types.ISubmodelElement[] = [];

  const general = v<Partial<CarbonFootprintGeneralInformation>>(
    'carbonFootprintGeneralInformation',
  );
  const methods = general?.calculationMethods ?? [];
  if (methods.length > 0) {
    c.push(
      list(
        `${PCF}/PcfCalculationMethods`,
        methods.map((m) => property(`${PCF}/PcfCalculationMethods/PcfCalculationMethod`, m)),
      ),
    );
  }
  const pcf = v<string>('carbonFootprintPerFunctionalUnit');
  if (pcf) c.push(property(`${PCF}/PcfCO2eq`, pcf));
  const unit = general?.referenceImpactUnit;
  if (unit) c.push(property(`${PCF}/ReferenceImpactUnitForCalculation`, unit));
  const quantity = general?.quantityOfMeasure;
  if (quantity) c.push(property(`${PCF}/QuantityOfMeasureForCalculation`, quantity));

  const phases: aas.types.ISubmodelElement[] = [];
  for (const id of SHARE_ATTRIBUTES) {
    if (v<string>(id) === undefined) continue;
    const name = getAttribute(id)?.name.en;
    if (name) phases.push(property(`${PCF}/LifeCyclePhases/LifeCyclePhase`, name));
  }
  if (phases.length > 0) c.push(list(`${PCF}/LifeCyclePhases`, phases));

  const klass = v<string>('carbonFootprintPerformanceClass');
  if (klass) c.push(property(`${PCF}/PerformanceClass`, klass));

  const links = v<{ id: string; uri?: string }[]>('carbonFootprintStudyLink') ?? [];
  if (links.length > 0) {
    c.push(
      list(
        `${PCF}/WebLinkToPublicCarbonFootprintStudy`,
        links.map((d) =>
          property(`${PCF}/WebLinkToPublicCarbonFootprintStudy/DocumentIdentifier`, d.uri ?? d.id),
        ),
      ),
    );
  }

  const pcfCollection = collection(PCF, c);
  return submodelFromTemplate(3, ids.submodelId('CarbonFootprint'), [
    list(`${P}/ProductCarbonFootprints`, [pcfCollection]),
  ]);
}
