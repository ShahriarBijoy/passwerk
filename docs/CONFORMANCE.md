# AAS conformance

Generated: 2026-09-03T23:08:31Z
Oracle: aas-test-engines 1.0.3
passwerk: @passwerk/core 0.0.0
Parity: 14/14

| Sample | Format | passwerk L2 | Oracle | Parity | Oracle messages |
|---|---|---|---|---|---|
| ev-missing-material-identifier | json | 0 errors | ok | yes |  |
| ev-missing-material-identifier | aasx | 0 errors | ok | yes |  |
| ev-valid | json | 0 errors | ok | yes |  |
| ev-valid | aasx | 0 errors | ok | yes |  |
| industrial-bad-decimal | json | 1 error | ERROR | yes | Value '74,9' is not a 'xs:decimal' @ ProductCarbonFootprints.0.PcfCO2eq in Submodel CarbonFootprint[https://passport.musterwerk.example/battery/MW-IND-2026-000007/submodels/CarbonFootprint] @ /submodels/1/submodel_elements/0/value/0/value/1 |
| industrial-bad-decimal | aasx | 1 error | ERROR | yes | Value '74,9' is not a 'xs:decimal' @ ProductCarbonFootprints.0.PcfCO2eq in Submodel CarbonFootprint[https://passport.musterwerk.example/battery/MW-IND-2026-000007/submodels/CarbonFootprint] @ /submodels/1/submodel_elements/0/value/0/value/1 |
| industrial-valid | json | 0 errors | ok | yes |  |
| industrial-valid | aasx | 0 errors | ok | yes |  |
| lmt-missing-state-of-charge | json | 0 errors | ok | yes |  |
| lmt-missing-state-of-charge | aasx | 0 errors | ok | yes |  |
| lmt-valid | json | 0 errors | ok | yes |  |
| lmt-valid | aasx | 0 errors | ok | yes |  |
| lmt-wrong-date-format | json | 1 error | ERROR | yes | Value '01.03.2026' is not a 'xs:date' @ DateOfManufacture in Submodel BatteryNameplate[https://passport.musterwerk.example/battery/MW-LMT-2026-000042/submodels/BatteryNameplate] @ /submodels/0/submodel_elements/4 |
| lmt-wrong-date-format | aasx | 1 error | ERROR | yes | Value '01.03.2026' is not a 'xs:date' @ DateOfManufacture in Submodel BatteryNameplate[https://passport.musterwerk.example/battery/MW-LMT-2026-000042/submodels/BatteryNameplate] @ /submodels/0/submodel_elements/4 |

## What parity means

`aas-test-engines` checks the AAS 3.0 metamodel and its constraints. It does not know the
IDTA 02035 battery passport templates, so it cannot check template conformance (passwerk L3)
or draft-level rules (passwerk L1). Parity therefore means: the oracle reports **ok** exactly
when passwerk's **L2** (aas-core verification of the emitted JSON) reports zero errors, and
reports an error exactly when L2 does. Broken golden samples stay in the set so that
agreement is proven in both directions. A CRITICAL oracle result (internal error) never
counts as parity.

Every file is emitted by `tools/oracle/src/emit-golden.ts` from the golden drafts in
`packages/core/src/samples` and checked by `tools/oracle/oracle.py`. CI regenerates this
report on every run and fails if anything but the `Generated:` line differs.

## Manual oracle runs

Recorded by hand (BUILD_PLAN Phase 8): AASX Package Explorer, BatteryPass-Ready test environment. Add a row per run.

| Tool | Version | Date | Result |
|---|---|---|---|
