import type { BatteryCategory, LangText, TimelineStatus } from '@passwerk/rules';

/**
 * Wider than the three passport categories on purpose, so the tool can answer "no passport
 * needed" (ADR D-022). Labels are engine text; no Article 3 definition is quoted, because the
 * knowledge base does not hold them and this project does not guess legal references.
 */
export const BATTERY_TYPES = [
  'EV',
  'LMT',
  'INDUSTRIAL',
  'STATIONARY_BATTERY_ENERGY_STORAGE',
  'PORTABLE',
  'SLI',
  'OTHER',
] as const;
export type BatteryType = (typeof BATTERY_TYPES)[number];

export const ROLES = [
  'manufacturer',
  'authorised_representative',
  'importer',
  'distributor',
  'fulfilment_service_provider',
  'other',
] as const;
export type Role = (typeof ROLES)[number];

export interface ObligationInput {
  batteryType: BatteryType;
  /** Battery energy in kWh as a decimal string. Decides the industrial 2 kWh threshold. */
  energyKwh?: string;
  /** ISO date the battery is or was placed on the market or put into service. */
  placedOnMarketDate?: string;
  role: Role;
  /**
   * ISO date treated as "now". Drives the timeline's `inEffect` flags (falling back to
   * `placedOnMarketDate` when absent). The date gate itself is decided by
   * `placedOnMarketDate ?? asOf`, because the duty attaches when the battery is placed on
   * the market, not on the day someone happens to be asking.
   */
  asOf?: string;
}

export type ObligationVerdict = 'required' | 'not_required' | 'insufficient_input';

export interface ObligationTimelineEntry {
  id: string;
  date: string;
  dateRule: 'fixed' | 'latest_of';
  alternative?: string;
  title: LangText;
  legalRef: string;
  status: TimelineStatus;
  note?: LangText;
  /** True when the event's date is on or before the effective date. */
  inEffect: boolean;
  /** Carried through from the knowledge base: the entry is not yet confirmed. */
  verify: boolean;
}

export interface ObligationResult {
  verdict: ObligationVerdict;
  reason: LangText;
  /** Which input would settle an insufficient_input verdict. */
  missingInput: string[];
  category: BatteryCategory | null;
  mandatoryAttributes: string[];
  conditionalAttributes: string[];
  deferredAttributes: string[];
  timeline: ObligationTimelineEntry[];
  roleGuidance: LangText;
  sources: string[];
  isNotLegalAdvice: true;
}
