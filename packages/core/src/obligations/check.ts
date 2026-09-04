import {
  type BatteryCategory,
  getAttributesForCategory,
  getTimeline,
  type LangText,
} from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import type {
  BatteryType,
  ObligationInput,
  ObligationResult,
  ObligationTimelineEntry,
  Role,
} from './types.js';

/** The one citation used throughout, read from the knowledge base rather than typed here. */
function passportEvent() {
  const event = getTimeline().find((e) => e.id === 'battery-passport');
  if (!event) throw new Error('@passwerk/core: timeline.json has no battery-passport event');
  return event;
}

const CATEGORY_OF: Partial<Record<BatteryType, BatteryCategory>> = {
  EV: 'EV',
  LMT: 'LMT',
  INDUSTRIAL: 'INDUSTRIAL_GT_2KWH',
  STATIONARY_BATTERY_ENERGY_STORAGE: 'INDUSTRIAL_GT_2KWH',
};

const THRESHOLD_TYPES: BatteryType[] = ['INDUSTRIAL', 'STATIONARY_BATTERY_ENERGY_STORAGE'];

const ROLE_GUIDANCE: Record<Role, LangText> = {
  manufacturer: {
    en: 'The manufacturer places the battery on the market and is responsible for creating the passport and keeping it accurate.',
    de: 'Der Hersteller bringt die Batterie in Verkehr und ist dafür verantwortlich, den Pass zu erstellen und aktuell zu halten.',
  },
  authorised_representative: {
    en: 'An authorised representative acts on a written mandate from the manufacturer and should confirm in that mandate who maintains the passport.',
    de: 'Ein Bevollmächtigter handelt auf Grundlage eines schriftlichen Mandats des Herstellers; im Mandat sollte geregelt sein, wer den Pass pflegt.',
  },
  importer: {
    en: 'An importer must check that the passport exists and is reachable before placing the battery on the Union market.',
    de: 'Ein Importeur muss vor dem Inverkehrbringen in der Union prüfen, dass der Pass existiert und erreichbar ist.',
  },
  distributor: {
    en: 'A distributor must check that the battery carries the QR code and must not make it available if the passport is missing.',
    de: 'Ein Händler muss prüfen, dass die Batterie den QR-Code trägt, und darf sie ohne Pass nicht bereitstellen.',
  },
  fulfilment_service_provider: {
    en: 'A fulfilment service provider handles batteries placed on the market by others and should obtain written confirmation that a passport exists.',
    de: 'Ein Fulfilment-Dienstleister behandelt Batterien, die andere in Verkehr bringen, und sollte sich schriftlich bestätigen lassen, dass ein Pass existiert.',
  },
  other: {
    en: 'Establish which economic operator role applies before deciding who must create and maintain the passport.',
    de: 'Zunächst klären, welche Rolle als Wirtschaftsakteur zutrifft, bevor entschieden wird, wer den Pass erstellen und pflegen muss.',
  },
};

function attributeSets(category: BatteryCategory | null) {
  if (category === null) {
    return { mandatoryAttributes: [], conditionalAttributes: [], deferredAttributes: [] };
  }
  const ids = (statuses: Parameters<typeof getAttributesForCategory>[1]) =>
    getAttributesForCategory(category, statuses)
      .map((a) => a.id)
      .sort();
  return {
    mandatoryAttributes: ids(['mandatory']),
    conditionalAttributes: ids(['conditional']),
    deferredAttributes: ids(['not_yet_applicable', 'not_displayed']),
  };
}

function timelineFor(category: BatteryCategory | null, effectiveDate: string) {
  return getTimeline(category ?? undefined).map(
    (event): ObligationTimelineEntry => ({
      id: event.id,
      date: event.date,
      dateRule: event.dateRule,
      ...(event.alternative ? { alternative: event.alternative } : {}),
      title: event.title,
      legalRef: event.legalRef,
      status: event.status,
      ...(event.note ? { note: event.note } : {}),
      inEffect: event.date <= effectiveDate,
      verify: event.verify,
    }),
  );
}

function result(
  partial: Pick<ObligationResult, 'verdict' | 'reason' | 'category'> &
    Partial<Pick<ObligationResult, 'missingInput'>>,
  role: Role,
  effectiveDate: string,
): ObligationResult {
  return {
    ...partial,
    missingInput: partial.missingInput ?? [],
    ...attributeSets(partial.category),
    timeline: timelineFor(partial.category, effectiveDate),
    roleGuidance: ROLE_GUIDANCE[role],
    sources: [passportEvent().legalRef],
    isNotLegalAdvice: true,
  };
}

/**
 * Does this battery need a passport, and if so which attribute set applies? Every claim cites
 * Article 77(1) as read from timeline.json; no Article 3 definition is quoted (ADR D-022).
 */
export function checkObligations(input: ObligationInput): ObligationResult {
  const event = passportEvent();
  const effectiveDate = input.asOf ?? input.placedOnMarketDate ?? '';

  if (effectiveDate === '') {
    return result(
      {
        verdict: 'insufficient_input',
        category: null,
        missingInput: ['placedOnMarketDate', 'asOf'],
        reason: {
          en: 'The passport obligation depends on when the battery is placed on the market. Provide that date, or an "as of" date to reason about.',
          de: 'Die Passpflicht hängt davon ab, wann die Batterie in Verkehr gebracht wird. Bitte dieses Datum oder ein Stichdatum angeben.',
        },
      },
      input.role,
      event.date,
    );
  }

  const category = CATEGORY_OF[input.batteryType] ?? null;

  if (category === null) {
    return result(
      {
        verdict: 'not_required',
        category: null,
        reason: {
          en: `${event.legalRef} requires a battery passport only for LMT batteries, industrial batteries above 2 kWh and electric vehicle batteries. This battery type is not one of them.`,
          de: `${event.legalRef} verlangt einen Batteriepass nur für LMT-Batterien, Industriebatterien über 2 kWh und Elektrofahrzeugbatterien. Dieser Batterietyp gehört nicht dazu.`,
        },
      },
      input.role,
      effectiveDate,
    );
  }

  if (THRESHOLD_TYPES.includes(input.batteryType)) {
    if (input.energyKwh === undefined) {
      return result(
        {
          verdict: 'insufficient_input',
          category: null,
          missingInput: ['energyKwh'],
          reason: {
            en: 'An industrial battery needs a passport only above 2 kWh. Provide the battery energy in kWh.',
            de: 'Eine Industriebatterie braucht erst über 2 kWh einen Pass. Bitte die Batterieenergie in kWh angeben.',
          },
        },
        input.role,
        effectiveDate,
      );
    }
    let energy: Decimal;
    try {
      energy = new Decimal(input.energyKwh);
    } catch {
      return result(
        {
          verdict: 'insufficient_input',
          category: null,
          missingInput: ['energyKwh'],
          reason: {
            en: `"${input.energyKwh}" is not a number of kWh that can be compared with the 2 kWh threshold.`,
            de: `"${input.energyKwh}" ist keine kWh-Zahl, die mit der 2-kWh-Schwelle verglichen werden kann.`,
          },
        },
        input.role,
        effectiveDate,
      );
    }
    if (!energy.gt(2)) {
      return result(
        {
          verdict: 'not_required',
          category: null,
          reason: {
            en: `${energy.toString()} kWh is not above the 2 kWh threshold, so ${event.legalRef} does not require a battery passport.`,
            de: `${energy.toString()} kWh liegen nicht über der 2-kWh-Schwelle; ${event.legalRef} verlangt daher keinen Batteriepass.`,
          },
        },
        input.role,
        effectiveDate,
      );
    }
  }

  if (effectiveDate < event.date) {
    return result(
      {
        verdict: 'not_required',
        category: null,
        reason: {
          en: `The battery passport obligation starts on ${event.date} (${event.legalRef}). A battery placed on the market on ${effectiveDate} is before that date.`,
          de: `Die Batteriepass-Pflicht beginnt am ${event.date} (${event.legalRef}). Eine am ${effectiveDate} in Verkehr gebrachte Batterie liegt davor.`,
        },
      },
      input.role,
      effectiveDate,
    );
  }

  const stationary = input.batteryType === 'STATIONARY_BATTERY_ENERGY_STORAGE';
  return result(
    {
      verdict: 'required',
      category,
      reason: {
        en: stationary
          ? `A stationary battery energy storage system above 2 kWh is treated as an industrial battery for the passport data set (${event.legalRef}).`
          : `${event.legalRef} requires a battery passport for this battery from ${event.date}.`,
        de: stationary
          ? `Ein stationäres Batterie-Energiespeichersystem über 2 kWh wird für den Passdatensatz wie eine Industriebatterie behandelt (${event.legalRef}).`
          : `${event.legalRef} verlangt für diese Batterie ab ${event.date} einen Batteriepass.`,
      },
    },
    input.role,
    effectiveDate,
  );
}
