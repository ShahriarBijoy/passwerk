import type { BatteryCategory, ObligationResult, PassportMeta } from '@passwerk/core';
import { checkObligations } from '@passwerk/core';
import { parseIso } from '../date.ts';
import { type IdentifierResult, metaOf, type Project, passportIdOf } from '../project.ts';
import { type CarrierView, deriveCarrier } from './carrier.ts';
import { memoLast } from './memo.ts';

export interface ProjectDerived {
  obligations: ObligationResult;
  identifier: IdentifierResult;
  /** The obligations result's category, else the hand-picked one (voluntary passport). */
  category: BatteryCategory | null;
  /** Null until a category exists and the identifier is ok. */
  meta: PassportMeta | null;
  carrier: CarrierView;
}

const obligationsOf = memoLast(
  (
    batteryType: Project['batteryType'],
    role: Project['role'],
    energyKwh: string | undefined,
    placedOnMarketDate: string | undefined,
    asOf: string,
  ) => {
    // An unfinished date must not fall back to today's date or compare lexicographically.
    // Let core report its existing missing-date result until the supplied date is usable.
    const invalidDate = placedOnMarketDate !== undefined && !parseIso(placedOnMarketDate);
    return checkObligations({
      batteryType,
      role,
      ...(energyKwh !== undefined ? { energyKwh } : {}),
      ...(!invalidDate && placedOnMarketDate !== undefined ? { placedOnMarketDate } : {}),
      ...(!invalidDate ? { asOf } : {}),
    });
  },
);

const identifierOf = memoLast(passportIdOf);

export const deriveProject = memoLast((project: Project, asOf: string): ProjectDerived => {
  const obligations = obligationsOf(
    project.batteryType,
    project.role,
    project.energyKwh,
    project.placedOnMarketDate,
    asOf,
  );
  const identifier = identifierOf(project.identifier);
  const category = obligations.category ?? project.manualCategory ?? null;
  const dateValid =
    project.placedOnMarketDate === undefined || !!parseIso(project.placedOnMarketDate);
  const meta =
    dateValid && category !== null && identifier.ok
      ? metaOf(project, category, identifier.passportId)
      : null;
  const carrier: CarrierView = identifier.ok
    ? deriveCarrier(identifier.passportId)
    : { ok: false, message: identifier.message };
  return { obligations, identifier, category, meta, carrier };
});
