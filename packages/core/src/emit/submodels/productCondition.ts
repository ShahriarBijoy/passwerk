import { getAttribute } from '@passwerk/rules';
import type { RemainingPowerCapability } from '../../model/composites.js';
import { getField, type PassportDraft, presentValue } from '../../model/passport.js';
import type * as aas from '../../vendor/aasCore.js';
import { collection, list, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { documentIds, hasAny, integral, submodelFromTemplate, timestamp } from './shared.js';

const P = '5';

/** Value blocks in catalogue order: `${P}/${block}/{${valueIdShort},LastUpdate}`. */
const BLOCKS: readonly { id: string; block: string; value: string; int?: true }[] = [
  { id: 'energyThroughput', block: 'EnergyThroughput', value: 'EnergyThroughputValue' },
  { id: 'stateOfCharge', block: 'StateOfCharge', value: 'StateOfChargeValue' },
  { id: 'capacityThroughput', block: 'CapacityThroughput', value: 'CapacityThroughputValue' },
  {
    id: 'numberOfFullCycles',
    block: 'NumberOfFullCycles',
    value: 'NumberOfFullCyclesValue',
    int: true,
  },
  {
    id: 'stateOfCertifiedEnergy',
    block: 'StateOfCertifiedEnergy',
    value: 'StateOfCertifiedEnergyValue',
  },
  { id: 'remainingUsableBatteryEnergy', block: 'RemainingEnergy', value: 'RemainingEnergyValue' },
  { id: 'remainingCapacity', block: 'RemainingCapacity', value: 'RemainingCapacityValue' },
];
const TAIL_BLOCKS: readonly { id: string; block: string; value: string }[] = [
  {
    id: 'evolutionOfSelfDischarge',
    block: 'EvolutionOfSelfDischarge',
    value: 'EvolutionOfSelfDischargeValue',
  },
  {
    id: 'currentSelfDischargeRate',
    block: 'CurrentSelfDischargingRate',
    value: 'CurrentSelfDischargingRateValue',
  },
  {
    id: 'remainingRoundTripEnergyEfficiency',
    block: 'RemainingRoundTripEnergyEfficiency',
    value: 'RemainingRoundTripEnergyEfficiencyValue',
  },
];
const NEGATIVE_EVENTS = ['deepDischargeEvents', 'overchargeEvents'] as const;
const TEMPERATURE: readonly { id: string; idShort: string }[] = [
  { id: 'temperatureInformation', idShort: 'MeasuredTemp' },
  { id: 'timeInExtremeHighTemperature', idShort: 'TimeExtremeHighTemp' },
  { id: 'timeInExtremeLowTemperature', idShort: 'TimeExtremeLowTemp' },
  { id: 'timeChargingInExtremeHighTemperature', idShort: 'TimeExtremeHighTempCharging' },
  { id: 'timeChargingInExtremeLowTemperature', idShort: 'TimeExtremeLowTempCharging' },
];

export const PRODUCT_CONDITION_ATTRIBUTES: readonly string[] = [
  ...BLOCKS.map((b) => b.id),
  ...NEGATIVE_EVENTS,
  'informationOnAccidents',
  ...TEMPERATURE.map((t) => t.id),
  'remainingPowerCapability',
  ...TAIL_BLOCKS.map((b) => b.id),
];

type PowerIn = Partial<RemainingPowerCapability>;

/**
 * IDTA 02035-5 Product Condition. Every value carries a LastUpdate (Field.recordedAt, else
 * meta.createdAt; ADR D-015). Blocks are emitted only when their attribute is present, except
 * the structural InformationOnAccidents list, which the template always requires.
 */
export function emitProductCondition(
  draft: PassportDraft,
  ids: EmitIds,
): aas.types.Submodel | null {
  if (!hasAny(draft, PRODUCT_CONDITION_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const els: aas.types.ISubmodelElement[] = [];

  const valueBlock = (b: { id: string; block: string; value: string; int?: true }) => {
    const value = v<string>(b.id);
    if (value === undefined) return;
    const path = `${P}/${b.block}`;
    els.push(
      collection(path, [
        property(`${path}/${b.value}`, b.int ? integral(value) : value),
        property(`${path}/LastUpdate`, timestamp(draft, b.id)),
      ]),
    );
  };

  for (const b of BLOCKS) valueBlock(b);

  const EVENT = `${P}/NegativeEvents/NegativeEvent`;
  const events = NEGATIVE_EVENTS.filter((id) => v<string>(id) !== undefined).map((id) =>
    collection(EVENT, [
      property(`${EVENT}/NegativeEventValue`, `${getAttribute(id)?.name.en ?? id}: ${v(id)}`),
      property(`${EVENT}/LastUpdate`, timestamp(draft, id)),
    ]),
  );
  if (events.length > 0) els.push(list(`${P}/NegativeEvents`, events));

  els.push(documentIds(`${P}/InformationOnAccidents`, v('informationOnAccidents') ?? []));

  const TEMP = `${P}/TemperatureInformation`;
  const temps = TEMPERATURE.filter((t) => v<string>(t.id) !== undefined);
  if (temps.length > 0) {
    const stamps = temps
      .map((t) => getField(draft, t.id)?.recordedAt)
      .filter((s): s is string => s !== undefined)
      .sort();
    els.push(
      collection(TEMP, [
        ...temps.map((t) => property(`${TEMP}/${t.idShort}`, v<string>(t.id) as string)),
        property(`${TEMP}/LastUpdate`, stamps.at(-1) ?? draft.meta.createdAt),
      ]),
    );
  }

  const rpc = v<PowerIn>('remainingPowerCapability');
  if (rpc) {
    const RPC = `${P}/RemainingPowerCapability`;
    const DYN = `${RPC}/RemainingPowerCapabilityDynamicAt`;
    const at = timestamp(draft, 'remainingPowerCapability');
    const dyn: aas.types.ISubmodelElement[] = [property(`${DYN}/RPCLastUpdated`, at)];
    if (rpc.atSocPercent !== undefined) dyn.push(property(`${DYN}/AtSoC`, rpc.atSocPercent));
    if (rpc.powerPercent !== undefined) {
      dyn.push(property(`${DYN}/PowerCapabilityAt`, rpc.powerPercent));
    }
    els.push(collection(RPC, [collection(DYN, dyn), property(`${RPC}/LastUpdate`, at)]));
  }

  for (const b of TAIL_BLOCKS) valueBlock(b);

  return submodelFromTemplate(5, ids.submodelId('ProductCondition'), els);
}
