# Phase 3b design: emitters for IDTA 02035-4, -5 and -7

Date: 2026-09-04. Status: approved by the owner in session. Branch: `feat/core-emit-parts-4-5-7`.

This spec completes the "remaining four submodel emitters" item of ADR D-005 for three of the
four parts. Part 2 (Handover Documentation) is deferred to Phase 4; ADR D-014 records why.
It follows the Phase 2 spec (`2026-09-03-core-model-emit-validate-design.md`) sections 4.2
and 5.4 unchanged: elements are built only through catalogue paths, every emitter is
fail-honest, and L3 decides validity.

## 1. Goal and definition of done

`@passwerk/core` emits Technical Data (part 4), Product Condition (part 5) and Circularity
(part 7) from the attribute-keyed `PassportDraft`.

Definition of done:

1. `emitTechnicalData`, `emitProductCondition`, `emitCircularity` exist, are wired into
   `buildEnvironment` in part order (1, 3, 4, 5, 6, 7) and are exported.
2. The three valid golden samples carry complete part 4, 5 and 7 data (industrial: no part 5)
   and `validate(sample).verdict` is still `valid`.
3. A new broken sample `lmt-missing-state-of-charge` yields exactly `PW-L3-MISSING`.
4. `pnpm check` is green, snapshots updated, `pnpm oracle` shows 14/14 parity and the
   committed `docs/CONFORMANCE.md` and badge match.

Out of scope: part 2, L4 plausibility, gap report, the six attributes without a template
path (`carbonFootprintGeneralInformation` is handled by part 3 already; the other five wait
for Phase 5).

## 2. Model changes

### 2.1 `Field.recordedAt`

Part 5 pairs every value with a mandatory `LastUpdate` (`xs:dateTime`). `Field` gains
`recordedAt?: IsoDateTime`, the moment the value was measured or last updated. Emitters use it
where a template asks for a timestamp and fall back to `meta.createdAt`. The fallback is
recorded in ADR D-015 because it claims the passport-assembly time as the last update.

### 2.2 New composites (`model/composites.ts`)

```ts
OriginalPowerCapability = z.array(z.object({ atSocPercent: PercentString, powerW: DecimalString })).min(1)
InitialInternalResistance = z.object({ cellOhm: DecimalString, packOhm: DecimalString, moduleOhm: DecimalString.optional() })
RemainingPowerCapability = z.object({ atSocPercent: PercentString, powerPercent: PercentString })
SparePartComponent = z.object({ partName: z.string().min(1), partNumber: z.string().min(1) })
SparePartSupplier = z.object({
  name: MultilingualText,
  address: z.object({ nationalCode: z.string().min(1), postalCode: z.string().min(1), street: z.string().min(1) }).optional(),
  email: z.string().min(1).optional(),
  website: z.string().min(1).optional(),
  components: z.array(SparePartComponent).min(1).optional(),
})
COMPOSITE_SCHEMAS += {
  originalPowerCapability: OriginalPowerCapability,
  initialInternalResistance: InitialInternalResistance,
  remainingPowerCapability: RemainingPowerCapability,
  sparePartSources: z.array(SparePartSupplier).min(1),
  componentPartNumbers: z.array(SparePartComponent).min(1),
}
```

## 3. Shared helpers (`emit/submodels/shared.ts`)

- `integral(value: string): string` returns the integer lexical form when the decimal string
  is whole (`"95.0"` becomes `"95"`), otherwise the input unchanged. Used for every template
  property typed `xs:integer` or `xs:unsignedInt`. A fractional value then fails L2, which is
  the honest outcome.
- `timestamp(draft, id): string` returns `field.recordedAt ?? draft.meta.createdAt`.
- `documentIds(path, docs)`: builds a `SubmodelElementList` at `path` with one
  `property(`${path}/DocumentIdentifier`, d.uri ?? d.id)` per document. Extracted from the
  existing nameplate and carbon footprint code paths where they do the same (no behaviour
  change; the nameplate keeps its own list order).
- `templateCategory(draft): string` maps `batteryCategory` (attribute if present, else
  `meta.category`) to the strings the part 4 template documents: `EV` to `ev`, `LMT` to
  `lmt`, `INDUSTRIAL_GT_2KWH` to `industrial`. Other attribute values pass through
  unchanged.

## 4. Technical Data (part 4)

Emitted when any of the 31 part-4 attributes (see the mapping) or `batteryMass` is present.
`GeneralInformation` and all six `TechnicalPropertyAreas` collections are always emitted
(they are `One` in the template); missing leaves inside them surface as `PW-L3-MISSING`, which
names the exact gap.

| Template path (under `4/`) | Source |
|---|---|
| `GeneralInformation/ManufacturerName` | `manufacturerInformation.name.en`, else first language |
| `GeneralInformation/ManufacturerIdentifier` | `manufacturerInformation.identifier` |
| `GeneralInformation/BatteryCategory` | `templateCategory(draft)` |
| `GeneralInformation/BatteryMass` | `batteryMass` |
| `GeneralInformation/WarrantyInformation/WarrantyPeriod` | `warrantyPeriod` (collection only when present) |
| `TechnicalPropertyAreas/CapacityEnergyVoltage/NominalVoltage` | `nominalVoltage` |
| `.../CapacityEnergyVoltage/MinVoltage` | `minimumVoltage` |
| `.../CapacityEnergyVoltage/MaxVoltage` | `maximumVoltage` |
| `.../CapacityEnergyVoltage/RatedCapacity` | `ratedCapacity` |
| `.../CapacityEnergyVoltage/CapacityFade` | `capacityFade` |
| `.../CapacityEnergyVoltage/CertifiedUsableBatteryEnergy` | `certifiedUsableBatteryEnergy` |
| `.../RoundTripEnergyEfficiency/InitialRoundTripEnergyEfficiency` | `integral(initialRoundTripEnergyEfficiency)` |
| `.../RoundTripEnergyEfficiency/RoundTripEnergyEfficiencyAt50PercentOfCycleLife` | `integral(roundTripEnergyEfficiencyAt50PercentCycleLife)` |
| `.../RoundTripEnergyEfficiency/EnergyRoundTripEfficiencyFade` | `energyRoundTripEfficiencyFade` |
| `.../RoundTripEnergyEfficiency/InitialSelfDischargingRate` | `integral(initialSelfDischargeRate)` |
| `.../Resistance/InitialInternalResistanceOnBatteryCellLevel` | `initialInternalResistance.cellOhm` |
| `.../Resistance/InitialInternalResistanceOnBatteryPackLevel` | `initialInternalResistance.packOhm` |
| `.../Resistance/InitialInternalResistanceOnBatteryModuleLevel` | `initialInternalResistance.moduleOhm` |
| `.../Resistance/InternalResistanceIncreaseOfBatteryPackLevel` | `internalResistanceIncrease` (the KB's primary path; cell and module stay empty) |
| `.../PowerCapability/MaximumPermittedBatteryPower` | `maximumPermittedBatteryPower` |
| `.../PowerCapability/PowerFade` | `powerFade` |
| `.../PowerCapability/RatioNorminalBatteryPowerAndBatteryEnergy` | `powerToEnergyRatio` |
| `.../PowerCapability/OriginalPowerCapability/PowerCapabilityAt/{atSoc,powerCapabilityAt}` | one collection per `originalPowerCapability` item: `integral(atSocPercent)`, `powerW` |
| `.../Temperature/TemperatureRangeIdleState_LowerBoundary` | `temperatureRangeIdleLowerBoundary` |
| `.../Temperature/TemperatureRangeIdleState_UpperBoundary` | `temperatureRangeIdleUpperBoundary` |
| `.../Lifetime/ExpectedLifetimeInCalendarYears` | `integral(expectedLifetimeCalendarYears)` |
| `.../Lifetime/ExpectedNumberOfCycles` | `integral(expectedLifetimeCycles)` |
| `.../Lifetime/CapacityThresholdExhaustion` | `capacityThresholdForExhaustion` |
| `.../Lifetime/CRateOfRelevantCycleLifeTest` | `cRateOfCycleLifeTest` |

Not emitted (no attribute): `CompanyLogo`, `ProductImages`.

## 5. Product Condition (part 5)

Emitted when any part-5 attribute is present. Each value collection is emitted only when its
attribute is present, with `Value` then `LastUpdate = timestamp(draft, id)`.
`InformationOnAccidents` is a structural list (`One`, items `ZeroToMany`) and is emitted
whenever the submodel is, empty when the attribute is absent. `TemperatureInformation` is
emitted when any of its five attributes is present; its `LastUpdate` is the latest
`recordedAt` among them, else `meta.createdAt`.

| Template path (under `5/`) | Source |
|---|---|
| `EnergyThroughput/{EnergyThroughputValue,LastUpdate}` | `energyThroughput` |
| `StateOfCharge/{StateOfChargeValue,LastUpdate}` | `stateOfCharge` |
| `CapacityThroughput/{CapacityThroughputValue,LastUpdate}` | `capacityThroughput` |
| `NumberOfFullCycles/{NumberOfFullCyclesValue,LastUpdate}` | `integral(numberOfFullCycles)` |
| `StateOfCertifiedEnergy/{StateOfCertifiedEnergyValue,LastUpdate}` | `stateOfCertifiedEnergy` |
| `RemainingEnergy/{RemainingEnergyValue,LastUpdate}` | `remainingUsableBatteryEnergy` |
| `RemainingCapacity/{RemainingCapacityValue,LastUpdate}` | `remainingCapacity` |
| `NegativeEvents/NegativeEvent/{NegativeEventValue,LastUpdate}` | one event per present attribute of `deepDischargeEvents`, `overchargeEvents`; value `"<KB English name>: <count>"` (ADR D-015, `verify`) |
| `InformationOnAccidents/DocumentIdentifier` | `informationOnAccidents` |
| `TemperatureInformation/MeasuredTemp` | `temperatureInformation` |
| `TemperatureInformation/TimeExtremeHighTemp` | `timeInExtremeHighTemperature` |
| `TemperatureInformation/TimeExtremeLowTemp` | `timeInExtremeLowTemperature` |
| `TemperatureInformation/TimeExtremeHighTempCharging` | `timeChargingInExtremeHighTemperature` |
| `TemperatureInformation/TimeExtremeLowTempCharging` | `timeChargingInExtremeLowTemperature` |
| `TemperatureInformation/LastUpdate` | latest `recordedAt` of the five, else `createdAt` |
| `RemainingPowerCapability/RemainingPowerCapabilityDynamicAt/{RPCLastUpdated,AtSoC,PowerCapabilityAt}` and `RemainingPowerCapability/LastUpdate` | `remainingPowerCapability` (`atSocPercent`, `powerPercent`); both timestamps `timestamp(draft, 'remainingPowerCapability')` |
| `EvolutionOfSelfDischarge/{EvolutionOfSelfDischargeValue,LastUpdate}` | `evolutionOfSelfDischarge` |
| `CurrentSelfDischargingRate/{CurrentSelfDischargingRateValue,LastUpdate}` | `currentSelfDischargeRate` |
| `RemainingRoundTripEnergyEfficiency/{RemainingRoundTripEnergyEfficiencyValue,LastUpdate}` | `remainingRoundTripEnergyEfficiency` |

## 6. Circularity (part 7)

Emitted when any part-7 attribute is present. `SparePartSources` is a structural list
(`One`, items `ZeroToMany`) and is emitted whenever the submodel is.

| Template path (under `7/`) | Source |
|---|---|
| `DismantlingAndRemovalInformation/DocumentIdentifier` | `dismantlingInformation` |
| `SparePartSources/SparePartSupplier/NameOfSupplier` | `sparePartSources[i].name` (MLP) |
| `.../SparePartSupplier/AddressOfSupplier/{NationalCode,PostalCode,Street}` | `address.*` as MLP in the first language of `name` (the template types these as MultiLanguageProperty; ADR D-015) |
| `.../SparePartSupplier/EmailAddressOfSupplier/EmailAddress` | `email` |
| `.../SparePartSupplier/SupplierWebAddress` | `website` |
| `.../SparePartSupplier/Components/Component/{PartName,PartNumber}` | `components`, else the flat `componentPartNumbers` |
| `RecycledContentInformation/RecycledContent/{RecycledMaterial,PreConsumerShare,PostConsumerShare}` | one entry per material with any present share: `Cobalt`, `Lithium`, `Nickel`, `Lead` (the Article 8 materials, in that order) from `recycled<Material>{Pre,Post}Consumer` |
| `SafetyMeasures/SafetyInstructions/DocumentIdentifier` | `safetyMeasures` |
| `SafetyMeasures/ExtinguishingAgents/ExtinguishingAgent` | `extinguishingAgent` (one item) |
| `EndOfLifeInformation/WastePrevention/DocumentIdentifier` | `endUserInfoWastePrevention` |
| `EndOfLifeInformation/SeparateCollection/DocumentIdentifier` | `endUserInfoSeparateCollection` |
| `EndOfLifeInformation/InformationOnCollection/DocumentIdentifier` | `endUserInfoCollectionAndTreatment` |
| `RenewableContent` | `renewableContentShare` |

`SafetyMeasures` and `EndOfLifeInformation` collections are emitted when any of their
children is present.

## 7. Samples

- `ev-valid`: full parts 4, 5 and 7 (every mandatory leaf present, plus a few optional ones,
  two negative events, two spare-part suppliers, all four recycled materials).
- `lmt-valid`: parts 4, 5 and 7, minimal mandatory set for each; `stateOfCharge` carries a
  `recordedAt`.
- `industrial-valid`: parts 4 and 7, no part 5 (covers the absent-submodel path).
- `lmt-missing-state-of-charge` (new, broken): `lmt-valid` without `stateOfCharge`. Expected
  findings: `['PW-L3-MISSING']`.

All values fictional. Units in the draft follow the KB (`V`, `Ah`, `W`, `Ohm`, `%`, `degC`).

## 8. Tests

- `model.field.test.ts`: `recordedAt` accepts ISO date-time, rejects `01.03.2026`.
- `model.composites.test.ts` (new): each new composite accepts the sample shape and rejects
  a missing mandatory member.
- `emit.shared.test.ts` (new): `integral`, `timestamp` fallback, `templateCategory`.
- `emit.technicalData.test.ts`, `emit.productCondition.test.ts`, `emit.circularity.test.ts`:
  structure, catalogue order, value mapping, absence for the sample that lacks the part,
  integral normalisation, timestamp fallback, negative-event naming, recycled-content folding,
  component fallback.
- `emit.environment.test.ts`: submodel order 1, 3, 4, 5, 6, 7 for `ev-valid`.
- `golden.test.ts` and `samples.test.ts` cover the new sample through the existing loops.
- Snapshots in `emit.aasJson.test.ts` are regenerated once and reviewed.

## 9. Decisions to record

- D-014: part 2 deferred to Phase 4 (no DIN attribute maps to it; VDI 2770 classification,
  language and digital files need real ingested files).
- D-015: `Field.recordedAt` with `createdAt` fallback; negative-event naming; MLP address
  language; recycled-content folding into four Article 8 materials; integral normalisation for
  integer-typed template properties.
