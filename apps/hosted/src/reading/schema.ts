/**
 * What code knows about composite values: which leaves an entry has, how each leaf is
 * described to Jev, and how a cell's text becomes that leaf's value. The descriptions are
 * written here; the leaf kinds are read off core's Zod schemas, and a test proves every path
 * below exists in them.
 */
import {
  COMPOSITE_SCHEMAS,
  DecimalString,
  DocumentRef,
  MultilingualText,
  PercentString,
} from '@passwerk/core';
import type { z } from 'zod';

const MATERIAL_LEAVES = {
  name: 'the material name',
  identifier: 'the material identifier, such as its CAS number',
  massKg: 'the mass of this material in the battery, in kg',
  'location.componentName':
    'the battery component where the material is located, such as cathode, anode or electrolyte',
};

/** List attributes read from tables, one entry per row. */
export const ENTRY_LEAVES: Record<string, Record<string, string>> = {
  criticalRawMaterials: MATERIAL_LEAVES,
  electrodeAndElectrolyteMaterials: MATERIAL_LEAVES,
  hazardousSubstances: {
    name: 'the substance name',
    identifier: 'the substance identifier, such as its CAS number',
    class: 'the hazard class of the substance',
    concentrationPercent: 'the concentration of the substance in percent by weight',
    'location.componentName': 'the battery component where the substance is located',
    impacts: 'the hazard statements or impacts of the substance (for example H-statements)',
  },
  componentPartNumbers: {
    partName: 'the name of the replaceable component',
    partNumber: 'the part number of the component',
  },
  sparePartSources: {
    name: 'the name of the spare part supplier (the source itself)',
    'address.street': "the street and house number of the supplier's address",
    'address.postalCode': "the postal code of the supplier's address",
    'address.nationalCode': "the country code of the supplier's address",
    email: "the supplier's e-mail address",
    website: "the supplier's website",
  },
};

/** Object attributes whose leaves are picked one by one from facts. */
export const OBJECT_LEAVES: Record<string, Record<string, string>> = {
  manufacturerInformation: {
    identifier:
      "the manufacturer's identifier (registration or manufacturer number), not a battery or product id",
    'address.street': "street and house number of the manufacturer's postal address",
    'address.zipCode': "postal code of the manufacturer's address",
    'address.cityTown': "city or town of the manufacturer's address",
    'address.nationalCode': "country code of the manufacturer's address",
    'address.email': "the manufacturer's contact e-mail address",
    'address.phone': "the manufacturer's phone number",
    'address.website': "the manufacturer's website",
  },
  batteryChemistry: {
    clearName:
      'the clear (written-out) name of the battery chemistry, such as lithium iron phosphate',
    shortName: 'the short name of the battery chemistry, such as NMC or LFP',
  },
  initialInternalResistance: {
    packOhm: 'initial internal resistance at battery pack level, in ohm',
    cellOhm: 'initial internal resistance at battery cell level, in ohm',
    moduleOhm: 'initial internal resistance at battery module level, in ohm',
  },
};

/** Columns of a register of handed-over documents; a row becomes one document reference. */
export const DOCUMENT_LEAVES: Record<string, string> = {
  id: 'the document identifier or document number',
  title: 'the document title',
  version: 'the document version or revision',
  languages: 'the language codes of the document',
  'classification.classId': 'the VDI 2770 classification class id, such as 02-04',
  'classification.className.de': 'the German name of the classification class',
  'classification.className.en': 'the English name of the classification class',
  'classification.system': 'the classification system, such as VDI2770:2020',
  fileName: 'the file name of the document',
  contentType: 'the MIME content type of the file',
  uri: 'the web address (URI) where the file is stored',
};

/** Series attributes assembled from several facts, one entry per fact. */
export const SERIES: Record<string, string> = {
  originalPowerCapability:
    'the original power capability of the battery: the power in W or kW it can deliver at a stated state of charge (SoC)',
};

export type LeafKind = 'decimal' | 'text' | 'multilingual' | 'list';

interface Def {
  type: string;
  innerType?: z.ZodType;
  element?: z.ZodType;
  shape?: Record<string, z.ZodType>;
  valueType?: z.ZodType;
}
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def;

function unwrap(s: z.ZodType): z.ZodType {
  let node = s;
  for (let d = defOf(node); d.type === 'optional' && d.innerType; d = defOf(node)) {
    node = d.innerType;
  }
  return node;
}

function child(node: z.ZodType, part: string, path: string): z.ZodType {
  const d = defOf(node);
  const next =
    d.type === 'object' ? d.shape?.[part] : d.type === 'record' ? d.valueType : undefined;
  if (!next) throw new Error(`reading schema: "${path}" has no leaf "${part}"`);
  return unwrap(next);
}

/** The entry schema of a list attribute, or the value schema of an object attribute. */
export function entrySchema(attributeId: string): z.ZodType {
  if (attributeId === 'document') return DocumentRef;
  const schema = COMPOSITE_SCHEMAS[attributeId];
  if (!schema) throw new Error(`reading schema: ${attributeId} has no composite schema`);
  const d = defOf(schema);
  return d.type === 'array' && d.element ? unwrap(d.element) : schema;
}

/** `attributeId` is a composite id, or `document` for a document reference. */
export function leafSchema(attributeId: string, path: string): z.ZodType {
  let node = entrySchema(attributeId);
  for (const part of path.split('.')) node = child(node, part, path);
  return node;
}

export function leafKind(attributeId: string, path: string): LeafKind {
  const node = leafSchema(attributeId, path);
  if (node === DecimalString || node === PercentString) return 'decimal';
  if (node === MultilingualText) return 'multilingual';
  return defOf(node).type === 'array' ? 'list' : 'text';
}
