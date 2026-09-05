import {
  type ApplicabilityCell,
  type BatteryCategory,
  type Cardinality,
  getAttribute,
  getRule,
  type LangText,
  plausibilityRules,
  type ValueKind,
} from '@passwerk/rules';
import { message, RULE_IDS } from '../validate/messages.js';

export interface AttributeExplanation {
  kind: 'attribute';
  id: string;
  name: LangText;
  /** The DIN DKE SPEC 99100 longlist definition, verbatim. */
  definition: string;
  explanation: LangText;
  synonyms: { de: string[]; en: string[] };
  whoTypicallyHasIt: LangText;
  valueKind: ValueKind;
  unit: string | null;
  range: { min: number | null; max: number | null } | null;
  applicability: Record<BatteryCategory, ApplicabilityCell>;
  applicabilitySource: 'ec' | 'override';
  legalRefs: string[];
  dynamic: boolean;
  template: {
    path: string;
    part: number;
    submodelIdShort: string;
    idShort: string | null;
    semanticId: string | null;
    cardinality: Cardinality;
    valueType: string | null;
    exampleValue: string | null;
  }[];
  relatedRules: string[];
  verify: boolean;
  lastVerified: string;
  isNotLegalAdvice: true;
}

export interface RuleExplanation {
  kind: 'rule';
  id: string;
  /** null for engine rules: their severity is decided per finding, not per rule. */
  severity: 'error' | 'warning' | null;
  title: LangText;
  message: LangText;
  fixHint: LangText;
  attributes: { id: string; name: LangText }[];
  legalRef: string | null;
  isNotLegalAdvice: true;
}

/** Everything the knowledge base holds about one attribute. Nothing is composed. */
export function explainAttribute(id: string): AttributeExplanation | undefined {
  const attribute = getAttribute(id);
  if (!attribute) return undefined;
  return {
    kind: 'attribute',
    id: attribute.id,
    name: attribute.name,
    definition: attribute.din.row.definition,
    explanation: attribute.explanation,
    synonyms: attribute.synonyms,
    whoTypicallyHasIt: attribute.whoTypicallyHasIt,
    valueKind: attribute.valueKind,
    unit: attribute.unit,
    range: attribute.range,
    applicability: attribute.applicability,
    applicabilitySource: attribute.applicabilitySource,
    legalRefs: attribute.legalRefs,
    dynamic: attribute.dynamic,
    template: attribute.templateElements.map((element) => ({
      path: element.path,
      part: element.part,
      submodelIdShort: element.submodelIdShort,
      idShort: element.idShort,
      semanticId: element.semanticId,
      cardinality: element.cardinality,
      valueType: element.valueType,
      exampleValue: element.exampleValue,
    })),
    relatedRules: plausibilityRules
      .filter((rule) => rule.attributes.includes(attribute.id))
      .map((rule) => rule.id)
      .sort(),
    verify: attribute.verify,
    lastVerified: attribute.lastVerified,
    isNotLegalAdvice: true,
  };
}

/**
 * A plausibility rule, or one of the engine rules in validate/messages.ts so an agent can
 * look up any finding id it receives. Engine rules carry no legal reference.
 */
export function explainRule(id: string): RuleExplanation | undefined {
  const rule = getRule(id);
  if (rule) {
    return {
      kind: 'rule',
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      message: rule.message,
      fixHint: rule.fixHint,
      attributes: rule.attributes.map((attributeId) => ({
        id: attributeId,
        name: getAttribute(attributeId)?.name ?? { de: attributeId, en: attributeId },
      })),
      legalRef: rule.legalRef,
      isNotLegalAdvice: true,
    };
  }
  if (!RULE_IDS.includes(id)) return undefined;
  const text = message(id, '...');
  return {
    kind: 'rule',
    id,
    severity: null,
    title: text,
    message: text,
    fixHint: {
      en: 'This is an engine rule about the structure or the AAS conformance of the passport, not a domain rule.',
      de: 'Dies ist eine Engine-Regel zur Struktur oder AAS-Konformität des Passes, keine Fachregel.',
    },
    attributes: [],
    legalRef: null,
    isNotLegalAdvice: true,
  };
}

/** Dispatches on the PW- prefix: rule ids start with it, attribute ids never do. */
export function explain(id: string): AttributeExplanation | RuleExplanation | undefined {
  return id.startsWith('PW-') ? explainRule(id) : explainAttribute(id);
}
