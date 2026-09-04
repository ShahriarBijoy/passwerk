import type { LangText } from '@passwerk/rules';

export type GapBucket = 'required' | 'conditional' | 'deferred' | 'optional';
export type GapStatus = 'present' | 'missing' | 'invalid' | 'conflict' | 'not_applicable';

/**
 * Workflow instructions, not legal claims: what to do next about one attribute. The deferred
 * wording carries the reassurance that used to live in PW-PLAUS-013 (ADR D-023): a data point
 * the Commission marks 'not yet applicable' is not a gap as of February 2027.
 */
export function suggestedAction(
  status: GapStatus,
  bucket: GapBucket,
  whoTypicallyHasIt: LangText,
): LangText {
  if (bucket === 'deferred') {
    return {
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
