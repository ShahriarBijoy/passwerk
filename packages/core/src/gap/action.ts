import type { ApplicabilityStatus, LangText } from '@passwerk/rules';

export type GapBucket = 'required' | 'conditional' | 'deferred' | 'optional';
export type GapStatus = 'present' | 'missing' | 'invalid' | 'conflict' | 'not_applicable';

/**
 * Workflow instructions, not legal claims: what to do next about one attribute. The deferred
 * wording carries the reassurance that used to live in PW-PLAUS-013 (ADR D-023): a data point
 * the Commission marks 'not yet applicable' is not a gap as of February 2027.
 *
 * `deferred` covers two different Commission verdicts — 'not yet applicable' (relevant on a
 * later date) and 'not displayed' (never to be filled) — and a value may already be present
 * under either. Attributing the wrong one, or speaking of "absence" for a value the supplier
 * holds, is a factual error, so the bucket branches four ways on `applicability` and `status`.
 */
export function suggestedAction(
  status: GapStatus,
  bucket: GapBucket,
  applicability: ApplicabilityStatus,
  whoTypicallyHasIt: LangText,
): LangText {
  if (bucket === 'deferred') {
    if (applicability === 'not_yet_applicable') {
      return status === 'present'
        ? {
            en: 'No action. This data point is not yet applicable for this battery category; the value you already hold is informational until the enabling act applies.',
            de: 'Keine Aktion. Dieser Datenpunkt ist für diese Batteriekategorie noch nicht anwendbar; der bereits vorliegende Wert ist bis zum Geltungsbeginn des Rechtsakts informativ.',
          }
        : {
            en: 'No action yet. The Commission marks this data point as not yet applicable for this battery category; it becomes relevant on a later date (see the obligations timeline), so its absence is not a gap today.',
            de: 'Noch keine Aktion. Die Kommission stuft diesen Datenpunkt für diese Batteriekategorie als noch nicht anwendbar ein; er wird zu einem späteren Zeitpunkt relevant (siehe Pflichten-Zeitplan), sein Fehlen ist heute keine Lücke.',
          };
    }
    return status === 'present'
      ? {
          en: 'No action. The Commission marks this data point as not to be filled or displayed for this battery category; the value you hold is not a passport requirement.',
          de: 'Keine Aktion. Die Kommission stuft diesen Datenpunkt für diese Batteriekategorie als nicht auszufüllen bzw. nicht anzuzeigen ein; der vorliegende Wert ist keine Passanforderung.',
        }
      : {
          en: 'No action. The Commission marks this data point as not to be filled or displayed for this battery category, so its absence is not a gap.',
          de: 'Keine Aktion. Die Kommission stuft diesen Datenpunkt für diese Batteriekategorie als nicht auszufüllen bzw. nicht anzuzeigen ein; sein Fehlen ist keine Lücke.',
        };
  }
  switch (status) {
    case 'present':
      return {
        en: 'Nothing to do. Keep the source document with the passport for verification.',
        de: 'Nichts zu tun. Belegdokument zusammen mit dem Pass für die Prüfung aufbewahren.',
      };
    case 'invalid':
      return {
        en: `The value is present but rejected by validation. Correct it with the typical data holder: ${whoTypicallyHasIt.en}`,
        de: `Der Wert ist vorhanden, aber von der Prüfung abgelehnt. Mit dem typischen Datenhalter korrigieren: ${whoTypicallyHasIt.de}`,
      };
    case 'conflict':
      return {
        en: `Two documents disagree. Decide which source is authoritative with the typical data holder: ${whoTypicallyHasIt.en}`,
        de: `Zwei Dokumente widersprechen sich. Mit dem typischen Datenhalter klären, welche Quelle maßgeblich ist: ${whoTypicallyHasIt.de}`,
      };
    case 'not_applicable':
      return {
        en: 'Marked as not applicable for this battery. Record why, in case a market surveillance authority asks.',
        de: 'Für diese Batterie als nicht zutreffend markiert. Begründung dokumentieren, falls eine Marktüberwachungsbehörde nachfragt.',
      };
    default:
      return bucket === 'conditional'
        ? {
            en: `Confirm whether this applies to your battery; if it does, request the value. Typical data holder: ${whoTypicallyHasIt.en}`,
            de: `Prüfen, ob dies für Ihre Batterie zutrifft; falls ja, den Wert anfordern. Typischer Datenhalter: ${whoTypicallyHasIt.de}`,
          }
        : {
            en: `Request this value. Typical data holder: ${whoTypicallyHasIt.en}`,
            de: `Diesen Wert anfordern. Typischer Datenhalter: ${whoTypicallyHasIt.de}`,
          };
  }
}
