import type { BatteryCategory, BatteryType, PassportMeta, Role } from '@passwerk/core';
import {
  buildGs1DigitalLink,
  CarrierInputError,
  isHttpsUri,
  SCHEMA_VERSION,
  Uri,
} from '@passwerk/core';
import { type Key, type LangText, t } from '../i18n/index.ts';

export type Identifier =
  | { mode: 'gs1'; resolverBase: string; gtin: string; serial: string }
  | { mode: 'gs1-giai'; resolverBase: string; giai: string }
  | { mode: 'https'; uri: string }
  | { mode: 'draft'; urn: string };

export type IdentifierMode = Identifier['mode'];
export const IDENTIFIER_MODES: readonly IdentifierMode[] = ['gs1', 'gs1-giai', 'https', 'draft'];

/** The inputs of the project screen. Everything derived from them lives in `derive/project.ts`. */
export interface Project {
  batteryType: BatteryType;
  role: Role;
  /** Decimal string in kWh; decides the industrial 2 kWh threshold. */
  energyKwh?: string;
  /** ISO date (YYYY-MM-DD). */
  placedOnMarketDate?: string;
  /** Chosen by hand when the obligations check derives no category (voluntary passport) or on import. */
  manualCategory?: BatteryCategory;
  identifier: Identifier;
  /** Stamped by the reducer on the first `setProject`, kept afterwards. */
  createdAt: string;
}

export type IdentifierResult =
  | { ok: true; passportId: string; digitalLink?: string }
  | { ok: false; message: LangText };

const both = (key: Key): LangText => ({ de: t('de', key), en: t('en', key) });

/** The passport identifier an `Identifier` denotes, built through core's carrier module. */
export function passportIdOf(id: Identifier): IdentifierResult {
  switch (id.mode) {
    case 'gs1':
    case 'gs1-giai': {
      const key =
        id.mode === 'gs1'
          ? { gtin: id.gtin.trim(), serial: id.serial.trim() }
          : { giai: id.giai.trim() };
      try {
        const link = buildGs1DigitalLink(id.resolverBase.trim(), key);
        return { ok: true, passportId: link, digitalLink: link };
      } catch (e) {
        if (e instanceof CarrierInputError) return { ok: false, message: e.text };
        throw e;
      }
    }
    case 'https': {
      const uri = id.uri.trim();
      return isHttpsUri(uri)
        ? { ok: true, passportId: uri }
        : { ok: false, message: both('project.identifier.https.invalid') };
    }
    case 'draft': {
      const urn = id.urn.trim();
      return Uri.safeParse(urn).success
        ? { ok: true, passportId: urn }
        : { ok: false, message: both('project.identifier.draft.invalid') };
    }
  }
}

export const BATTERY_TYPE_OF: Record<BatteryCategory, BatteryType> = {
  EV: 'EV',
  LMT: 'LMT',
  INDUSTRIAL_GT_2KWH: 'INDUSTRIAL',
};

export function defaultProject(urn: string, createdAt: string): Project {
  return { batteryType: 'EV', role: 'manufacturer', identifier: { mode: 'draft', urn }, createdAt };
}

/** An imported draft's meta as a project: category by hand, battery type mapped back. */
export function projectFromMeta(meta: PassportMeta): Project {
  return {
    batteryType: BATTERY_TYPE_OF[meta.category],
    role: 'manufacturer',
    manualCategory: meta.category,
    identifier: isHttpsUri(meta.passportId)
      ? { mode: 'https', uri: meta.passportId }
      : { mode: 'draft', urn: meta.passportId },
    createdAt: meta.createdAt,
  };
}

export function metaOf(
  project: Project,
  category: BatteryCategory,
  passportId: string,
): PassportMeta {
  return { schemaVersion: SCHEMA_VERSION, category, passportId, createdAt: project.createdAt };
}
