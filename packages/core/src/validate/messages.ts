/**
 * DE/EN texts per rule id. `{detail}` is replaced by the caller's detail string.
 * These are engine messages, not legal claims; legal texts live in the knowledge base.
 */
const MESSAGES: Record<string, { de: string; en: string }> = {
  'PW-L1-SCHEMA': {
    de: 'Strukturfehler im Entwurf: {detail}',
    en: 'Structural error in the draft: {detail}',
  },
  'PW-L1-UNKNOWN-ATTRIBUTE': {
    de: 'Unbekannte Attribut-ID "{detail}". Gültige IDs stehen in der Wissensbasis (@passwerk/rules).',
    en: 'Unknown attribute id "{detail}". Valid ids are listed in the knowledge base (@passwerk/rules).',
  },
  'PW-L1-VALUE': {
    de: 'Wert passt nicht zum erwarteten Typ: {detail}',
    en: 'Value does not match the expected type: {detail}',
  },
  'PW-L1-PASSPORT-ID-MISMATCH': {
    de: 'meta.passportId und das Attribut batteryPassportIdentifier unterscheiden sich: {detail}',
    en: 'meta.passportId and the attribute batteryPassportIdentifier differ: {detail}',
  },
  'PW-L1-IMPACT-UNASSIGNED': {
    de: 'substanceImpacts ist gesetzt, aber keinem Gefahrstoff zugeordnet; beim Export wird der Text jedem Gefahrstoff zugeordnet.',
    en: 'substanceImpacts is set but not assigned to a hazardous substance; on export the text is attached to every substance.',
  },
  'PW-L1-COMPOSITE-UNMODELLED': {
    de: 'Zusammengesetztes Attribut "{detail}" hat in dieser Version noch keine feste Struktur; der Wert wird nicht geprüft.',
    en: 'Composite attribute "{detail}" has no fixed shape in this version yet; the value is not checked.',
  },
  'PW-L1-DOCUMENT-UNCLASSIFIED': {
    de: 'Dokument "{detail}" hat keine VDI-2770-Klassifikation und wird nicht in die Übergabedokumentation (IDTA 02035-2) übernommen.',
    en: 'Document "{detail}" has no VDI 2770 classification and is not included in Handover Documentation (IDTA 02035-2).',
  },
  'PW-L2-DESERIALIZE': {
    de: 'Die AAS-JSON-Ausgabe lässt sich nicht als AAS-Umgebung lesen: {detail}',
    en: 'The AAS JSON output cannot be read as an AAS environment: {detail}',
  },
  'PW-L2-AAS-CORE': {
    de: 'AAS-Metamodell-Verletzung: {detail}',
    en: 'AAS metamodel violation: {detail}',
  },
  'PW-L3-UNKNOWN-SUBMODEL': {
    de: 'Kein IDTA-02035-Template für das Teilmodell mit semanticId "{detail}".',
    en: 'No IDTA 02035 template for the submodel with semanticId "{detail}".',
  },
  'PW-L3-MISSING': {
    de: 'Pflichtelement des Templates fehlt: {detail}',
    en: 'Mandatory template element is missing: {detail}',
  },
  'PW-L3-TOO-MANY': {
    de: 'Zu viele Elemente für {detail}',
    en: 'Too many elements for {detail}',
  },
  'PW-L3-MODEL-TYPE': {
    de: 'Falscher Elementtyp: {detail}',
    en: 'Wrong element type: {detail}',
  },
  'PW-L3-SEMANTIC-ID': {
    de: 'semanticId weicht vom Template ab: {detail}',
    en: 'semanticId differs from the template: {detail}',
  },
  'PW-L3-VALUE-TYPE': {
    de: 'valueType weicht vom Template ab: {detail}',
    en: 'valueType differs from the template: {detail}',
  },
  'PW-L3-LIST-TYPE': {
    de: 'Listen-Typangaben weichen vom Template ab: {detail}',
    en: 'List type settings differ from the template: {detail}',
  },
  'PW-L3-UNKNOWN-ELEMENT': {
    de: 'Element ist im Template nicht vorgesehen: {detail}',
    en: 'Element is not defined in the template: {detail}',
  },
  'PW-L3-SUBMODEL-ID-SHORT': {
    de: 'idShort des Teilmodells weicht vom Template ab: {detail}',
    en: 'Submodel idShort differs from the template: {detail}',
  },
};

export function message(ruleId: string, detail = ''): { de: string; en: string } {
  const m = MESSAGES[ruleId];
  if (!m) throw new Error(`@passwerk/core: no message for rule ${ruleId}`);
  return { de: m.de.replaceAll('{detail}', detail), en: m.en.replaceAll('{detail}', detail) };
}

export const RULE_IDS: readonly string[] = Object.keys(MESSAGES);
