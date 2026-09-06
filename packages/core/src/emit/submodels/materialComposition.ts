import type { BatteryChemistry } from '../../model/composites.js';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import type * as aas from '../../vendor/aasCore.js';
import { collection, list, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { hasAny, push, submodelFromTemplate } from './shared.js';

const P = '6';
const MAT = `${P}/BatteryMaterials/BatteryMaterial`;
const HAZ = `${P}/HazardousSubstances/HazardousSubstance`;

export const MATERIAL_ATTRIBUTES: readonly string[] = [
  'batteryChemistry',
  'criticalRawMaterials',
  'electrodeAndElectrolyteMaterials',
  'hazardousSubstances',
  'substanceImpacts',
];

/** Loose input shapes: the emitter must tolerate drafts that failed L1 (fail-honest emit). */
interface MaterialIn {
  name?: string;
  identifier?: string;
  massKg?: string;
  location?: { componentName?: string; componentId?: string };
}
interface SubstanceIn extends MaterialIn {
  class?: string;
  concentrationPercent?: string;
  impacts?: string[];
}

function location(
  path: string,
  loc: MaterialIn['location'],
): aas.types.SubmodelElementCollection | null {
  if (!loc || (!loc.componentName && !loc.componentId)) return null;
  const children: aas.types.ISubmodelElement[] = [];
  if (loc.componentName) children.push(property(`${path}/ComponentName`, loc.componentName));
  if (loc.componentId) children.push(property(`${path}/ComponentId`, loc.componentId));
  return collection(path, children);
}

function material(m: MaterialIn, critical: boolean): aas.types.SubmodelElementCollection {
  const c: aas.types.ISubmodelElement[] = [];
  push(c, location(`${MAT}/BatteryMaterialLocation`, m.location));
  if (m.identifier) c.push(property(`${MAT}/BatteryMaterialIdentifier`, m.identifier));
  if (m.name) c.push(property(`${MAT}/BatteryMaterialName`, m.name));
  if (m.massKg) c.push(property(`${MAT}/BatteryMaterialMass`, m.massKg));
  c.push(property(`${MAT}/IsCriticalRawMaterial`, critical ? 'true' : 'false'));
  return collection(MAT, c);
}

function substance(
  s: SubstanceIn,
  fallbackImpact: string | undefined,
): aas.types.SubmodelElementCollection {
  const c: aas.types.ISubmodelElement[] = [];
  if (s.class) c.push(property(`${HAZ}/HazardousSubstanceClass`, s.class));
  if (s.name) c.push(property(`${HAZ}/HazardousSubstanceName`, s.name));
  if (s.concentrationPercent) {
    c.push(property(`${HAZ}/HazardousSubstanceConcentration`, s.concentrationPercent));
  }
  const own = s.impacts && s.impacts.length > 0 ? s.impacts : undefined;
  const impacts = own ?? (fallbackImpact ? [fallbackImpact] : []);
  if (impacts.length > 0) {
    c.push(
      list(
        `${HAZ}/HazardousSubstanceImpact`,
        impacts.map((i) => property(`${HAZ}/HazardousSubstanceImpact/Impact`, i)),
      ),
    );
  }
  push(c, location(`${HAZ}/HazardousSubstanceLocation`, s.location));
  if (s.identifier) c.push(property(`${HAZ}/HazardousSubstanceIdentifier`, s.identifier));
  return collection(HAZ, c);
}

/** IDTA 02035-6 Material Composition. Returns null when the draft has no material data. */
export function emitMaterialComposition(
  draft: PassportDraft,
  ids: EmitIds,
): aas.types.Submodel | null {
  if (!hasAny(draft, MATERIAL_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const els: aas.types.ISubmodelElement[] = [];

  const chem = v<Partial<BatteryChemistry>>('batteryChemistry');
  if (chem) {
    const c: aas.types.ISubmodelElement[] = [];
    if (chem.shortName) c.push(property(`${P}/BatteryChemistry/ShortName`, chem.shortName));
    if (chem.clearName) c.push(property(`${P}/BatteryChemistry/ClearName`, chem.clearName));
    els.push(collection(`${P}/BatteryChemistry`, c));
  }

  const critical = v<MaterialIn[]>('criticalRawMaterials') ?? [];
  const electrode = v<MaterialIn[]>('electrodeAndElectrolyteMaterials') ?? [];
  const criticalIds = new Set(critical.map((m) => m.identifier).filter(Boolean));
  const materials = [
    ...critical.map((m) => material(m, true)),
    ...electrode.map((m) =>
      material(m, m.identifier !== undefined && criticalIds.has(m.identifier)),
    ),
  ];
  if (materials.length > 0) els.push(list(`${P}/BatteryMaterials`, materials));

  const substances = v<SubstanceIn[]>('hazardousSubstances') ?? [];
  const flatImpact = v<string>('substanceImpacts');
  if (substances.length > 0) {
    els.push(
      list(
        `${P}/HazardousSubstances`,
        substances.map((s) => substance(s, flatImpact)),
      ),
    );
  }

  return submodelFromTemplate(6, ids.submodelId('MaterialComposition'), els);
}
